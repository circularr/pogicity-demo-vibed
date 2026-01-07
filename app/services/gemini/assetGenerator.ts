// Asset Generator - High-level orchestrator for generating game assets
// Coordinates prompt building, API calls, image processing, and file management

import { generateImageWithImagen, validateApiKey } from './client';
import {
    buildBuildingPrompt,
    buildCharacterPrompt,
    buildPropPrompt,
    getRequiredDirections,
    AssetDirection,
    AssetStyle,
    BuildingPromptConfig,
    PropPromptConfig
} from './promptBuilder';
import {
    fetchImage,
    base64ToBlob,
    processGameAsset,
    generateBuildingFilename,
    getBuildingAssetPath,
    generatePropFilename,
    getPropAssetPath
} from './imageProcessor';
import { BuildingCategory, BuildingDefinition } from '@/app/data/buildings';

export interface GeneratedAsset {
    id: string;
    name: string;
    type: 'building' | 'character' | 'prop';
    category?: BuildingCategory;
    sprites: Record<string, Blob>;
    spritePaths: Record<string, string>;
    footprint?: { width: number; height: number };
    definition?: BuildingDefinition;
}

export interface GenerationProgress {
    current: number;
    total: number;
    currentDirection?: AssetDirection;
    status: string;
}

export type ProgressCallback = (progress: GenerationProgress) => void;

/**
 * Get API key from environment
 */
function getApiKey(): string {
    const key = process.env.OPENROUTER_API_KEY ||
        (typeof window !== 'undefined' ? (window as unknown as Record<string, string | undefined>).OPENROUTER_API_KEY : undefined);
    if (!key) {
        throw new Error('OpenRouter API key not configured. Please set OPENROUTER_API_KEY environment variable.');
    }
    return key;
}

/**
 * Generate a complete building asset with all direction sprites
 */
export async function generateBuildingAsset(
    config: {
        id: string;
        name: string;
        category: BuildingCategory;
        footprint: { width: number; height: number };
        style?: AssetStyle;
        description?: string;
        supportsRotation?: boolean;
    },
    onProgress?: ProgressCallback,
    apiKey?: string
): Promise<GeneratedAsset> {
    const key = apiKey || getApiKey();

    // Validate API key first
    const isValid = await validateApiKey(key);
    if (!isValid) {
        throw new Error('Invalid API key');
    }

    const directions = getRequiredDirections(config.supportsRotation ?? true);
    const sprites: Record<string, Blob> = {};
    const spritePaths: Record<string, string> = {};

    for (let i = 0; i < directions.length; i++) {
        const direction = directions[i];

        onProgress?.({
            current: i + 1,
            total: directions.length,
            currentDirection: direction,
            status: `Generating ${direction} view...`
        });

        const promptConfig: BuildingPromptConfig = {
            name: config.name,
            category: config.category,
            footprint: config.footprint,
            style: config.style,
            description: config.description,
            direction
        };

        const prompt = buildBuildingPrompt(promptConfig);
        const result = await generateImageWithImagen({ prompt }, key);

        if (!result.success) {
            throw new Error(`Failed to generate ${direction} sprite: ${result.error}`);
        }

        let imageBlob: Blob;
        if (result.imageUrl) {
            imageBlob = await fetchImage(result.imageUrl);
        } else if (result.imageBase64) {
            imageBlob = base64ToBlob(result.imageBase64);
        } else {
            throw new Error(`No image data for ${direction} sprite`);
        }

        // Process the image (resize, remove background if needed)
        const processedBlob = await processGameAsset(imageBlob, {
            targetWidth: 512,
            targetHeight: 512,
            removeBackground: true
        });

        const filename = generateBuildingFilename(config.id, config.footprint, direction);
        const assetPath = getBuildingAssetPath(config.category, filename);

        sprites[direction] = processedBlob;
        spritePaths[direction] = assetPath;
    }

    // Create building definition
    const definition: BuildingDefinition = {
        id: config.id,
        name: config.name,
        category: config.category,
        footprint: config.footprint,
        sprites: {
            south: spritePaths.south,
            north: spritePaths.north,
            east: spritePaths.east,
            west: spritePaths.west,
        },
        icon: getCategoryIcon(config.category),
        supportsRotation: config.supportsRotation ?? directions.length > 1,
    };

    return {
        id: config.id,
        name: config.name,
        type: 'building',
        category: config.category,
        sprites,
        spritePaths,
        footprint: config.footprint,
        definition
    };
}

/**
 * Generate a prop/decoration asset
 */
export async function generatePropAsset(
    config: {
        id: string;
        name: string;
        footprint?: { width: number; height: number };
        style?: AssetStyle;
        description?: string;
        supportsRotation?: boolean;
    },
    onProgress?: ProgressCallback,
    apiKey?: string
): Promise<GeneratedAsset> {
    const key = apiKey || getApiKey();

    const directions = getRequiredDirections(config.supportsRotation ?? false);
    const sprites: Record<string, Blob> = {};
    const spritePaths: Record<string, string> = {};
    const footprint = config.footprint || { width: 1, height: 1 };

    for (let i = 0; i < directions.length; i++) {
        const direction = directions[i];

        onProgress?.({
            current: i + 1,
            total: directions.length,
            currentDirection: direction,
            status: `Generating ${direction} view...`
        });

        const promptConfig: PropPromptConfig = {
            name: config.name,
            description: config.description,
            style: config.style,
            direction: config.supportsRotation ? direction : undefined
        };

        const prompt = buildPropPrompt(promptConfig);
        const result = await generateImageWithImagen({ prompt }, key);

        if (!result.success) {
            throw new Error(`Failed to generate ${direction} sprite: ${result.error}`);
        }

        let imageBlob: Blob;
        if (result.imageUrl) {
            imageBlob = await fetchImage(result.imageUrl);
        } else if (result.imageBase64) {
            imageBlob = base64ToBlob(result.imageBase64);
        } else {
            throw new Error(`No image data for ${direction} sprite`);
        }

        const processedBlob = await processGameAsset(imageBlob, {
            targetWidth: 256,
            targetHeight: 256,
            removeBackground: true
        });

        const filename = generatePropFilename(config.id, footprint, config.supportsRotation ? direction : undefined);
        const assetPath = getPropAssetPath(filename);

        sprites[direction] = processedBlob;
        spritePaths[direction] = assetPath;
    }

    const definition: BuildingDefinition = {
        id: config.id,
        name: config.name,
        category: 'props',
        footprint,
        sprites: {
            south: spritePaths.south,
            ...(spritePaths.north && { north: spritePaths.north }),
            ...(spritePaths.east && { east: spritePaths.east }),
            ...(spritePaths.west && { west: spritePaths.west }),
        },
        icon: '🎄',
        supportsRotation: config.supportsRotation,
        isDecoration: true,
    };

    return {
        id: config.id,
        name: config.name,
        type: 'prop',
        category: 'props',
        sprites,
        spritePaths,
        footprint,
        definition
    };
}

/**
 * Get default icon for a category
 */
function getCategoryIcon(category: BuildingCategory): string {
    const icons: Record<BuildingCategory, string> = {
        residential: '🏠',
        commercial: '🏢',
        civic: '🏛️',
        landmark: '🏰',
        props: '🌳',
        christmas: '🎄',
    };
    return icons[category];
}

/**
 * Save generated asset to file system (via API route)
 */
export async function saveAssetToFileSystem(
    asset: GeneratedAsset
): Promise<{ success: boolean; error?: string }> {
    try {
        const formData = new FormData();
        formData.append('assetId', asset.id);
        formData.append('assetType', asset.type);
        formData.append('definition', JSON.stringify(asset.definition));

        // Add each sprite file
        for (const [direction, blob] of Object.entries(asset.sprites)) {
            const filename = asset.spritePaths[direction].split('/').pop() || `${direction}.png`;
            formData.append(`sprite_${direction}`, blob, filename);
            formData.append(`path_${direction}`, asset.spritePaths[direction]);
        }

        const response = await fetch('/api/assets/save', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            return { success: false, error };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export { validateApiKey } from './client';
