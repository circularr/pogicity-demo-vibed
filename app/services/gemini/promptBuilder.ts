// Prompt builder for generating game assets
// Creates optimized prompts for isometric building, character, and prop generation

import { BuildingCategory } from '@/app/data/buildings';

export type AssetDirection = 'south' | 'north' | 'east' | 'west';
export type AssetStyle = 'modern' | 'victorian' | 'gothic' | 'futuristic' | 'cartoon' | 'pixel' | 'realistic';

export interface BuildingPromptConfig {
    name: string;
    category: BuildingCategory;
    footprint: { width: number; height: number };
    style?: AssetStyle;
    description?: string;
    direction: AssetDirection;
}

export interface CharacterPromptConfig {
    name: string;
    description?: string;
    style?: AssetStyle;
    direction: AssetDirection;
    action: 'walk' | 'idle' | 'run';
}

export interface PropPromptConfig {
    name: string;
    description?: string;
    style?: AssetStyle;
    direction?: AssetDirection;
}

/**
 * Map direction to camera angle description
 */
function getDirectionDescription(direction: AssetDirection): string {
    const descriptions: Record<AssetDirection, string> = {
        south: 'front-facing view (camera looking from south toward north, building faces camera)',
        north: 'back-facing view (camera looking from north toward south, showing back of building)',
        east: 'right side view (camera looking from east toward west)',
        west: 'left side view (camera looking from west toward east)',
    };
    return descriptions[direction];
}

/**
 * Map category to architectural hints
 */
function getCategoryHints(category: BuildingCategory): string {
    const hints: Record<BuildingCategory, string> = {
        residential: 'living spaces like apartments, houses, or condos with windows, balconies, and homey details',
        commercial: 'business establishment with storefront, signage, and commercial features like awnings',
        civic: 'public building like government, library, or community center with formal architecture',
        landmark: 'iconic, unique architectural landmark with distinctive memorable features',
        props: 'decorative object or urban furniture',
        christmas: 'festive winter holiday theme with snow, lights, decorations, and warm cozy atmosphere',
    };
    return hints[category];
}

/**
 * Generate prompt for building asset
 */
export function buildBuildingPrompt(config: BuildingPromptConfig): string {
    const { name, category, footprint, style = 'modern', description, direction } = config;

    const directionDesc = getDirectionDescription(direction);
    const categoryHints = getCategoryHints(category);

    return `Create a game asset image of an isometric ${name} building.

STYLE: ${style} architectural style
CATEGORY: ${category} - ${categoryHints}
SIZE: ${footprint.width}x${footprint.height} tile footprint (each tile is 44x22 pixels in isometric)
${description ? `DETAILS: ${description}` : ''}

CAMERA ANGLE: 2:1 isometric projection (classic video game isometric), ${directionDesc}
- The camera should be at a 30-degree angle from horizontal
- The building should be rendered from a ${direction} viewpoint

IMAGE REQUIREMENTS:
1. Transparent background (PNG with alpha channel)
2. Building centered on canvas with space for height
3. Clean edges, suitable for game sprites
4. Consistent lighting from top-left
5. No ground shadows (shadows will be added in-game)
6. Base of building should align with isometric grid (diamond-shaped footprint)
7. Front corner of building at bottom-center of image

QUALITY: High-quality game asset, clean lines, vibrant but not oversaturated colors, suitable for a modern city builder game like SimCity or Cities Skylines but more stylized.`;
}

/**
 * Generate prompt for character asset
 */
export function buildCharacterPrompt(config: CharacterPromptConfig): string {
    const { name, description, style = 'cartoon', direction, action } = config;

    const directionMap: Record<AssetDirection, string> = {
        south: 'walking toward camera (front view)',
        north: 'walking away from camera (back view)',
        east: 'walking to the right (right profile)',
        west: 'walking to the left (left profile)',
    };

    return `Create a game asset sprite sheet or animation frame of a ${name} character.

STYLE: ${style} style, cute and friendly character design
${description ? `DESCRIPTION: ${description}` : ''}

POSE: ${action}ing, ${directionMap[direction]}
DIRECTION: ${direction} - character ${directionMap[direction]}

IMAGE REQUIREMENTS:
1. Transparent background
2. Small sprite size (32-64 pixels tall)
3. Clean pixel art or smooth vector style suitable for animation
4. Simple, readable silhouette
5. Character centered in frame
6. Consistent proportions for animation compatibility
7. Bright, cheerful colors

This will be used as a walking animation frame in an isometric city builder game.`;
}

/**
 * Generate prompt for prop/decoration asset
 */
export function buildPropPrompt(config: PropPromptConfig): string {
    const { name, description, style = 'modern', direction } = config;

    let directionInstructions = '';
    if (direction) {
        directionInstructions = `DIRECTION: ${direction} view - ${getDirectionDescription(direction)}`;
    } else {
        directionInstructions = 'DIRECTION: Front-facing isometric view';
    }

    return `Create a game asset image of a ${name} prop/decoration.

STYLE: ${style} style, clean game asset
${description ? `DESCRIPTION: ${description}` : ''}

CAMERA ANGLE: 2:1 isometric projection
${directionInstructions}

IMAGE REQUIREMENTS:
1. Transparent background (PNG with alpha channel)
2. Small to medium size (fits 1-2 tile footprint)
3. Clean edges, no artifacts
4. Suitable for placing on grass or paved areas
5. Consistent top-left lighting
6. Vibrant but natural colors
7. Object centered in frame

This is a decorative prop for an isometric city builder game like SimCity or Cities Skylines.`;
}

/**
 * Get all directions needed for an asset type
 */
export function getRequiredDirections(supportsRotation: boolean): AssetDirection[] {
    if (supportsRotation) {
        return ['south', 'north', 'east', 'west'];
    }
    return ['south'];
}
