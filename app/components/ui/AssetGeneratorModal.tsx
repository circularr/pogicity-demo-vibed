'use client';

import { useState, useCallback } from 'react';
import { BuildingCategory, BuildingDefinition, saveGeneratedBuilding } from '@/app/data/buildings';
import { AssetStyle, AssetDirection } from '@/app/services/gemini/promptBuilder';

// Target size for game assets (matches existing buildings)
const TARGET_SIZE = 512;

// Resize an image from a data URL to TARGET_SIZE x TARGET_SIZE
async function resizeFromDataURL(dataUrl: string): Promise<{ dataUrl: string; blob: Blob }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = TARGET_SIZE;
            canvas.height = TARGET_SIZE;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Draw with smooth scaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, TARGET_SIZE, TARGET_SIZE);

            const resizedDataUrl = canvas.toDataURL('image/png');

            canvas.toBlob((resizedBlob) => {
                if (resizedBlob) {
                    resolve({ dataUrl: resizedDataUrl, blob: resizedBlob });
                } else {
                    reject(new Error('Failed to create resized blob'));
                }
            }, 'image/png');
        };
        img.onerror = () => reject(new Error('Failed to load image for resizing'));
        img.src = dataUrl;
    });
}

// Resize an image blob to TARGET_SIZE x TARGET_SIZE
async function resizeImageBlob(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = TARGET_SIZE;
            canvas.height = TARGET_SIZE;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, TARGET_SIZE, TARGET_SIZE);

            canvas.toBlob((resizedBlob) => {
                if (resizedBlob) {
                    resolve(resizedBlob);
                } else {
                    reject(new Error('Failed to create resized blob'));
                }
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for resizing'));
        };
        img.src = url;
    });
}

// Target sprite size - building content should be small within 512x512 canvas
const SPRITE_CANVAS = 512;
const TARGET_BUILDING_HEIGHT = 120; // Max height for the building content
const TARGET_BUILDING_WIDTH = 100;  // Max width for the building content

// Process sprite: remove bg, scale to proper size, position at bottom-center
async function processSprite(blob: Blob, footprint: { w: number; h: number }): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);

            // Step 1: Draw to temp canvas and remove white background
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');

            if (!tempCtx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            tempCtx.drawImage(img, 0, 0);
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;

            // Make white/near-white pixels transparent and find content bounds
            let minX = tempCanvas.width, minY = tempCanvas.height, maxX = 0, maxY = 0;
            const threshold = 240;

            for (let y = 0; y < tempCanvas.height; y++) {
                for (let x = 0; x < tempCanvas.width; x++) {
                    const i = (y * tempCanvas.width + x) * 4;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];

                    if (r >= threshold && g >= threshold && b >= threshold) {
                        data[i + 3] = 0; // Make transparent
                    } else if (data[i + 3] > 0) {
                        // Track content bounds
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
                }
            }

            tempCtx.putImageData(imageData, 0, 0);

            // Step 2: Calculate content dimensions
            const contentWidth = maxX - minX + 1;
            const contentHeight = maxY - minY + 1;

            if (contentWidth <= 0 || contentHeight <= 0) {
                reject(new Error('No content found in image'));
                return;
            }

            // Step 3: Calculate target size based on footprint
            // Larger footprints = slightly larger sprites
            const targetW = TARGET_BUILDING_WIDTH + (footprint.w - 2) * 20;
            const targetH = TARGET_BUILDING_HEIGHT + (footprint.h - 2) * 20;

            // Scale to fit within target, maintaining aspect ratio
            const scaleX = targetW / contentWidth;
            const scaleY = targetH / contentHeight;
            const scale = Math.min(scaleX, scaleY, 1.0); // Never upscale

            const scaledW = Math.round(contentWidth * scale);
            const scaledH = Math.round(contentHeight * scale);

            // Step 4: Create final 512x512 canvas with content at bottom-center
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = SPRITE_CANVAS;
            finalCanvas.height = SPRITE_CANVAS;
            const finalCtx = finalCanvas.getContext('2d');

            if (!finalCtx) {
                reject(new Error('Could not get final canvas context'));
                return;
            }

            // Clear with transparency
            finalCtx.clearRect(0, 0, SPRITE_CANVAS, SPRITE_CANVAS);

            // Position: bottom-center of canvas
            const destX = (SPRITE_CANVAS - scaledW) / 2;
            const destY = SPRITE_CANVAS - scaledH;

            // Draw scaled content
            finalCtx.imageSmoothingEnabled = true;
            finalCtx.imageSmoothingQuality = 'high';
            finalCtx.drawImage(
                tempCanvas,
                minX, minY, contentWidth, contentHeight, // source
                destX, destY, scaledW, scaledH // destination
            );

            finalCanvas.toBlob((newBlob) => {
                if (newBlob) {
                    resolve(newBlob);
                } else {
                    reject(new Error('Failed to create processed sprite'));
                }
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for processing'));
        };
        img.src = url;
    });
}

interface AssetGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssetGenerated?: (assetId: string, definition: Record<string, unknown>) => void;
    initialCategory?: BuildingCategory;
}

type AssetType = 'building' | 'prop';
type GenerationPhase = 'configure' | 'preview' | 'generating-others' | 'complete';
type ModelKey = 'gemini-flash' | 'gemini-pro';

const MODEL_OPTIONS: Record<ModelKey, { name: string; cost: string; speed: string }> = {
    'gemini-flash': { name: 'Gemini Flash', cost: '~$0.03', speed: '🚀 Fast' },
    'gemini-pro': { name: 'Gemini Pro', cost: '~$0.14', speed: '💎 Best Quality' },
};

interface GenerationState {
    phase: GenerationPhase;
    progress: number;
    total: number;
    currentDirection?: string;
    status: string;
    error?: string;
}

interface GeneratedSprite {
    direction: string;
    imageUrl: string;
    blob?: Blob;
}

export function AssetGeneratorModal({ isOpen, onClose, onAssetGenerated, initialCategory = 'commercial' }: AssetGeneratorModalProps) {
    // Form state
    const [assetType, setAssetType] = useState<AssetType>('building');
    const [name, setName] = useState('');
    const [id, setId] = useState('');
    const [category, setCategory] = useState<BuildingCategory>(initialCategory);
    const [style, setStyle] = useState<AssetStyle>('modern');
    const [footprintWidth, setFootprintWidth] = useState(2);
    const [footprintHeight, setFootprintHeight] = useState(2);
    const [description, setDescription] = useState('');
    const [supportsRotation, setSupportsRotation] = useState(true);
    const [apiKey, setApiKey] = useState('');
    const [selectedModel, setSelectedModel] = useState<ModelKey>('gemini-flash');

    // Generation state
    const [generationState, setGenerationState] = useState<GenerationState>({
        phase: 'configure',
        progress: 0,
        total: 0,
        status: '',
    });
    const [generatedSprites, setGeneratedSprites] = useState<GeneratedSprite[]>([]);
    const [showApiKeyInput, setShowApiKeyInput] = useState(false);
    const [referenceImage, setReferenceImage] = useState<GeneratedSprite | null>(null);

    // Auto-generate ID from name
    const handleNameChange = (newName: string) => {
        setName(newName);
        const newId = newName.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
        setId(newId);
    };

    // Reset on close
    const handleClose = () => {
        setName('');
        setId('');
        setGeneratedSprites([]);
        setReferenceImage(null);
        setGenerationState({ phase: 'configure', progress: 0, total: 0, status: '' });
        onClose();
    };

    // Step 1: Generate the south (front) view only
    const generatePreview = async () => {
        if (!name || !id) {
            setGenerationState(s => ({ ...s, error: 'Please enter a name for the asset' }));
            return;
        }

        setGenerationState({
            phase: 'preview',
            progress: 1,
            total: 1,
            status: 'Generating front view...'
        });

        try {
            const prompt = buildPrompt('south');
            const response = await fetch('/api/assets/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, apiKey: apiKey || undefined, model: selectedModel })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate preview');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Generation failed');
            }

            let imageUrl = '';
            let blob: Blob | undefined;

            if (data.imageUrl) {
                // If it's a data URL, resize immediately
                if (data.imageUrl.startsWith('data:')) {
                    try {
                        const resized = await resizeFromDataURL(data.imageUrl);
                        imageUrl = resized.dataUrl;
                        blob = resized.blob;
                    } catch (e) {
                        console.warn('Resize failed, using original:', e);
                        imageUrl = data.imageUrl;
                    }
                } else {
                    imageUrl = data.imageUrl;
                    try {
                        const imgResponse = await fetch(data.imageUrl);
                        if (imgResponse.ok) {
                            const originalBlob = await imgResponse.blob();
                            blob = await resizeImageBlob(originalBlob);
                        }
                    } catch { /* ignore */ }
                }
            } else if (data.imageBase64) {
                const originalDataUrl = `data:image/png;base64,${data.imageBase64}`;
                try {
                    const resized = await resizeFromDataURL(originalDataUrl);
                    imageUrl = resized.dataUrl;
                    blob = resized.blob;
                } catch (e) {
                    console.warn('Resize failed, using original:', e);
                    imageUrl = originalDataUrl;
                    const binaryString = atob(data.imageBase64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let j = 0; j < binaryString.length; j++) {
                        bytes[j] = binaryString.charCodeAt(j);
                    }
                    blob = new Blob([bytes], { type: 'image/png' });
                }
            }

            if (imageUrl) {
                const sprite: GeneratedSprite = { direction: 'south', imageUrl, blob };
                setReferenceImage(sprite);
                setGeneratedSprites([sprite]);
                setGenerationState({
                    phase: 'preview',
                    progress: 1,
                    total: 1,
                    status: 'Preview ready! Confirm to generate all directions.'
                });
            }
        } catch (error) {
            setGenerationState(s => ({
                ...s,
                phase: 'configure',
                error: error instanceof Error ? error.message : 'Unknown error'
            }));
        }
    };

    // Step 2: Generate remaining directions using reference image
    const generateAllDirections = async () => {
        if (!referenceImage) return;

        const directions: AssetDirection[] = supportsRotation
            ? ['north', 'east', 'west']
            : [];

        if (directions.length === 0) {
            // No additional directions needed, go to complete
            setGenerationState(s => ({ ...s, phase: 'complete', status: 'Asset ready to save!' }));
            return;
        }

        setGenerationState({
            phase: 'generating-others',
            progress: 0,
            total: directions.length,
            status: 'Generating additional views...'
        });

        const sprites: GeneratedSprite[] = [referenceImage];

        try {
            for (let i = 0; i < directions.length; i++) {
                const direction = directions[i];

                setGenerationState(s => ({
                    ...s,
                    progress: i + 1,
                    currentDirection: direction,
                    status: `Generating ${direction} view (${i + 1}/${directions.length})...`
                }));

                // Build prompt that references the original design
                const prompt = buildPromptWithReference(direction);

                // Get base64 from reference image for image-to-image
                let referenceBase64: string | undefined;
                if (referenceImage.imageUrl.startsWith('data:')) {
                    // Extract base64 from data URL
                    const match = referenceImage.imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
                    if (match) {
                        referenceBase64 = referenceImage.imageUrl; // Send full data URL
                    }
                }

                const response = await fetch('/api/assets/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt,
                        apiKey: apiKey || undefined,
                        referenceImageBase64: referenceBase64,
                        model: selectedModel
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Failed to generate ${direction} sprite`);
                }

                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || `Generation failed for ${direction}`);
                }

                let imageUrl = '';
                let blob: Blob | undefined;

                if (data.imageUrl) {
                    if (data.imageUrl.startsWith('data:')) {
                        try {
                            const resized = await resizeFromDataURL(data.imageUrl);
                            imageUrl = resized.dataUrl;
                            blob = resized.blob;
                        } catch (e) {
                            console.warn('Resize failed:', e);
                            imageUrl = data.imageUrl;
                        }
                    } else {
                        imageUrl = data.imageUrl;
                        try {
                            const imgResponse = await fetch(data.imageUrl);
                            if (imgResponse.ok) {
                                const originalBlob = await imgResponse.blob();
                                blob = await resizeImageBlob(originalBlob);
                            }
                        } catch { /* ignore */ }
                    }
                } else if (data.imageBase64) {
                    const originalDataUrl = `data:image/png;base64,${data.imageBase64}`;
                    try {
                        const resized = await resizeFromDataURL(originalDataUrl);
                        imageUrl = resized.dataUrl;
                        blob = resized.blob;
                    } catch (e) {
                        console.warn('Resize failed:', e);
                        imageUrl = originalDataUrl;
                        const binaryString = atob(data.imageBase64);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let j = 0; j < binaryString.length; j++) {
                            bytes[j] = binaryString.charCodeAt(j);
                        }
                        blob = new Blob([bytes], { type: 'image/png' });
                    }
                }

                if (imageUrl) {
                    sprites.push({ direction, imageUrl, blob });
                    setGeneratedSprites([...sprites]);
                }
            }

            setGenerationState({
                phase: 'complete',
                progress: directions.length,
                total: directions.length,
                status: 'All views generated! Ready to save.'
            });

        } catch (error) {
            setGenerationState(s => ({
                ...s,
                phase: 'preview',
                error: error instanceof Error ? error.message : 'Unknown error'
            }));
        }
    };

    const buildPrompt = (direction: AssetDirection): string => {
        // Calculate approximate pixel size based on tile footprint
        // Each tile is roughly 44x22 pixels
        // Base width for 1 tile is ~44px
        // Base height accounts for the tile + building height

        const footprintSize = Math.max(footprintWidth, footprintHeight);

        // Scale building mass with footprint
        // 1x1 -> ~80px tall building
        // 2x2 -> ~100px tall building
        // 4x4 -> ~140px tall building
        const approxWidth = footprintWidth * 44;
        const heightMultiplier = assetType === 'building' ? 40 : 20;
        const approxHeight = Math.max(80, footprintWidth * heightMultiplier);

        const sizeDesc = footprintSize > 2
            ? 'LARGE, TALL, MASSIVE building complex that fills the vertical space'
            : 'building sprite';

        const basePrompt = assetType === 'building'
            ? `Isometric ${name} ${sizeDesc} for a pixel-art city builder game. Style: ${style}. Category: ${category}.`
            : `Isometric ${name} prop sprite for a pixel-art city builder game. Style: ${style}.`;

        const directionDesc: Record<AssetDirection, string> = {
            south: 'front-facing view, camera looking from south-east',
            north: 'back view, camera looking from north-west',
            east: 'right side view, camera looking from south-west',
            west: 'left side view, camera looking from north-east',
        };

        return `${basePrompt}
${description ? `Details: ${description}` : ''}

CRITICAL SIZE REQUIREMENTS:
- The building must be sized approximately ${approxWidth}x${approxHeight} pixels
- For larger footprints (${footprintWidth}x${footprintHeight}), make the building TALLER and BULKIER
- Do NOT just add more pavement/ground - make the STRUCTURE itself larger
- The building must be positioned at the BOTTOM-CENTER of the image
- Leave LOTS of empty white space above and around the building
- The building should occupy only about 20-25% of the total image area
- This is a sprite for a game like SimCity or RollerCoaster Tycoon

Style requirements:
- 2:1 isometric projection (30 degrees), ${directionDesc[direction]}
- PURE WHITE (#FFFFFF) solid background
- Crisp pixel-art style edges
- Top-left lighting
- Front corner of building base at exact bottom-center of image`;
    };

    const buildPromptWithReference = (direction: AssetDirection): string => {
        const rotationDesc: Record<AssetDirection, string> = {
            south: 'This is the original front view',
            north: 'Rotate 180 degrees to show the back of this building',
            east: 'Rotate 90 degrees clockwise to show the right side',
            west: 'Rotate 90 degrees counter-clockwise to show the left side',
        };

        return `This is an isometric ${name} building. ${rotationDesc[direction]}.

CRITICAL REQUIREMENTS:
- This MUST be the EXACT SAME building shown in the image, just rotated to a different viewing angle
- Keep IDENTICAL: roof shape, window placement, colors, materials, architectural details, proportions
- Same ${footprintWidth}x${footprintHeight} tile footprint
- Same building height and shape
- Same lighting from top-left
- Isometric 2:1 projection (30° angle)
- PURE WHITE (#FFFFFF) solid background - NOT transparent

Do NOT create a new building design. Rotate the EXISTING building to the ${direction} view.`;
    };

    const saveAssets = async () => {
        if (generatedSprites.length === 0) return;

        setGenerationState(s => ({ ...s, status: 'Saving assets...' }));

        const formData = new FormData();
        formData.append('assetId', id);
        formData.append('assetType', assetType);

        const spritePaths: Record<string, string> = {};
        for (const sprite of generatedSprites) {
            const filename = `${footprintWidth}x${footprintHeight}${id}_${sprite.direction}.png`;
            const path = assetType === 'building'
                ? `/Building/${category}/${filename}`
                : `/Props/${filename}`;
            spritePaths[sprite.direction] = path;
        }

        const definition = {
            id,
            name,
            category: assetType === 'building' ? category : 'props' as BuildingCategory,
            footprint: { width: footprintWidth, height: footprintHeight },
            sprites: spritePaths,
            icon: getCategoryIcon(category),
            supportsRotation: supportsRotation && generatedSprites.length > 1,
            ...(assetType === 'prop' && { isDecoration: true }),
        };

        formData.append('definition', JSON.stringify(definition));

        // Process sprites: scale to proper size and remove background
        setGenerationState(s => ({ ...s, status: 'Processing images...' }));
        for (const sprite of generatedSprites) {
            if (sprite.blob) {
                const path = spritePaths[sprite.direction];
                try {
                    // Process: remove bg, scale down, position at bottom-center
                    const processedBlob = await processSprite(sprite.blob, { w: footprintWidth, h: footprintHeight });
                    formData.append(`sprite_${sprite.direction}`, processedBlob, path.split('/').pop() || 'sprite.png');
                    formData.append(`path_${sprite.direction}`, path);
                } catch (err) {
                    console.warn(`Failed to process ${sprite.direction}:`, err);
                    formData.append(`sprite_${sprite.direction}`, sprite.blob, path.split('/').pop() || 'sprite.png');
                    formData.append(`path_${sprite.direction}`, path);
                }
            }
        }

        try {
            const response = await fetch('/api/assets/save', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to save assets');
            }

            saveGeneratedBuilding(definition as BuildingDefinition);

            setGenerationState(s => ({
                ...s,
                status: 'Done! Asset added to picker.'
            }));

            onAssetGenerated?.(id, definition);

            // Auto-close after short delay
            setTimeout(() => handleClose(), 1500);
        } catch (error) {
            setGenerationState(s => ({
                ...s,
                error: error instanceof Error ? error.message : 'Failed to save assets'
            }));
        }
    };

    const getCategoryIcon = (cat: BuildingCategory): string => {
        const icons: Record<BuildingCategory, string> = {
            residential: '🏠',
            commercial: '🏢',
            civic: '🏛️',
            landmark: '🏰',
            props: '🌳',
            christmas: '🎄',
        };
        return icons[cat];
    };

    const regeneratePreview = () => {
        setReferenceImage(null);
        setGeneratedSprites([]);
        setGenerationState({ phase: 'configure', progress: 0, total: 0, status: '' });
    };

    if (!isOpen) return null;

    const isConfigPhase = generationState.phase === 'configure';
    const isPreviewPhase = generationState.phase === 'preview' && referenceImage;
    const isGeneratingOthers = generationState.phase === 'generating-others';
    const isComplete = generationState.phase === 'complete';

    return (
        <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
        >
            <div
                className="rct-frame"
                style={{ width: 420, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
                onKeyDown={(e) => e.stopPropagation()}
                onKeyUp={(e) => e.stopPropagation()}
                onKeyPress={(e) => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
            >
                {/* RCT-style title bar */}
                <div className="rct-titlebar">
                    <span>✨ New {assetType === 'building' ? 'Building' : 'Prop'}</span>
                    <button className="rct-close" onClick={handleClose}>×</button>
                </div>

                <div className="rct-panel" style={{ flex: 1, padding: 12, overflowY: 'auto' }}>

                    {/* Error Display */}
                    {generationState.error && (
                        <div style={{
                            background: 'rgba(200,50,50,0.3)',
                            border: '2px solid #c33',
                            padding: 8,
                            marginBottom: 12,
                            fontSize: 13
                        }}>
                            {generationState.error}
                            <button
                                onClick={() => setGenerationState(s => ({ ...s, error: undefined }))}
                                style={{ marginLeft: 8, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}
                            >
                                Dismiss
                            </button>
                        </div>
                    )}

                    {/* Configuration Phase */}
                    {isConfigPhase && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* Asset Type Tabs */}
                            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                <button
                                    onClick={() => setAssetType('building')}
                                    className={`rct-button ${assetType === 'building' ? 'active' : ''}`}
                                    style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}
                                >
                                    🏢 Building
                                </button>
                                <button
                                    onClick={() => setAssetType('prop')}
                                    className={`rct-button ${assetType === 'prop' ? 'active' : ''}`}
                                    style={{ flex: 1, padding: '6px 8px', fontSize: 13 }}
                                >
                                    🌳 Prop
                                </button>
                            </div>

                            {/* Name */}
                            <div>
                                <label style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    placeholder="e.g., Coffee Shop"
                                    className="rct-input"
                                    style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                                />
                            </div>

                            {/* Category (for buildings) */}
                            {assetType === 'building' && (
                                <div>
                                    <label style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Category</label>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value as BuildingCategory)}
                                        className="rct-input"
                                        style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                                    >
                                        <option value="residential">🏠 Residential</option>
                                        <option value="commercial">🏢 Commercial</option>
                                        <option value="civic">🏛️ Civic</option>
                                        <option value="landmark">🏰 Landmark</option>
                                        <option value="christmas">🎄 Christmas</option>
                                    </select>
                                </div>
                            )}

                            {/* Style */}
                            <div>
                                <label style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Style</label>
                                <select
                                    value={style}
                                    onChange={(e) => setStyle(e.target.value as AssetStyle)}
                                    className="rct-input"
                                    style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                                >
                                    <option value="modern">Modern</option>
                                    <option value="victorian">Victorian</option>
                                    <option value="cartoon">Cartoon</option>
                                    <option value="pixel">Pixel Art</option>
                                    <option value="futuristic">Futuristic</option>
                                </select>
                            </div>

                            {/* AI Model */}
                            <div>
                                <label style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>AI Model</label>
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value as ModelKey)}
                                    className="rct-input"
                                    style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                                >
                                    {Object.entries(MODEL_OPTIONS).map(([key, opt]) => (
                                        <option key={key} value={key}>
                                            {opt.speed} {opt.name} ({opt.cost}/img)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Size */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Width</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="8"
                                        value={footprintWidth}
                                        onChange={(e) => setFootprintWidth(Number(e.target.value))}
                                        className="rct-input"
                                        style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>Height</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="8"
                                        value={footprintHeight}
                                        onChange={(e) => setFootprintHeight(Number(e.target.value))}
                                        className="rct-input"
                                        style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                                    />
                                </div>
                            </div>

                            {/* Rotation */}
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input
                                    type="checkbox"
                                    checked={supportsRotation}
                                    onChange={(e) => setSupportsRotation(e.target.checked)}
                                />
                                Generate all 4 directions
                            </label>

                            {/* API Key (collapsible) */}
                            <details style={{ fontSize: 12 }}>
                                <summary style={{ cursor: 'pointer', opacity: 0.7 }}>API Key (optional)</summary>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="sk-or-v1-..."
                                    className="rct-input"
                                    style={{ width: '100%', padding: '6px 8px', fontSize: 12, marginTop: 4 }}
                                />
                            </details>
                        </div>
                    )}

                    {/* Preview Phase - Show generated south view */}
                    {isPreviewPhase && referenceImage && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, marginBottom: 8 }}>Front view of "{name}"</div>
                            <div style={{
                                background: 'var(--rct-panel-dark)',
                                padding: 8,
                                borderRadius: 4,
                                display: 'inline-block'
                            }}>
                                <img
                                    src={referenceImage.imageUrl}
                                    alt={name}
                                    style={{ maxWidth: 256, maxHeight: 256, imageRendering: 'pixelated' }}
                                />
                            </div>
                            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
                                {supportsRotation ? 'Confirm to generate other directions based on this design' : 'Ready to save!'}
                            </div>
                        </div>
                    )}

                    {/* Generating Other Directions */}
                    {isGeneratingOthers && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, marginBottom: 12 }}>{generationState.status}</div>
                            <div style={{
                                height: 8,
                                background: 'var(--rct-panel-dark)',
                                borderRadius: 4,
                                overflow: 'hidden'
                            }}>
                                <div
                                    style={{
                                        height: '100%',
                                        width: `${(generationState.progress / generationState.total) * 100}%`,
                                        background: 'var(--rct-button-active)',
                                        transition: 'width 0.3s'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                                {generatedSprites.map(sprite => (
                                    <div key={sprite.direction} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 10, marginBottom: 2 }}>{sprite.direction}</div>
                                        <img
                                            src={sprite.imageUrl}
                                            alt={sprite.direction}
                                            style={{ width: 80, height: 80, objectFit: 'contain', background: 'var(--rct-panel-dark)', borderRadius: 4 }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Complete - Show all sprites */}
                    {isComplete && (
                        <div>
                            <div style={{ fontSize: 13, marginBottom: 8, textAlign: 'center' }}>{generationState.status}</div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                {generatedSprites.map(sprite => (
                                    <div key={sprite.direction} style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 10, marginBottom: 2 }}>{sprite.direction.toUpperCase()}</div>
                                        <img
                                            src={sprite.imageUrl}
                                            alt={sprite.direction}
                                            style={{ width: 80, height: 80, objectFit: 'contain', background: 'var(--rct-panel-dark)', borderRadius: 4 }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Loading during preview generation */}
                    {generationState.phase === 'preview' && !referenceImage && (
                        <div style={{ textAlign: 'center', padding: 20 }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                            <div style={{ fontSize: 13 }}>{generationState.status}</div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div style={{
                    padding: '8px 12px',
                    background: 'var(--rct-panel-mid)',
                    borderTop: '2px solid var(--rct-panel-dark)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 8
                }}>
                    {isConfigPhase && (
                        <>
                            <button className="rct-button" onClick={handleClose} style={{ padding: '6px 12px' }}>
                                Cancel
                            </button>
                            <button
                                className="rct-button"
                                onClick={generatePreview}
                                disabled={!name}
                                style={{ padding: '6px 16px', fontWeight: 'bold' }}
                            >
                                Generate Preview
                            </button>
                        </>
                    )}

                    {isPreviewPhase && referenceImage && (
                        <>
                            <button className="rct-button" onClick={regeneratePreview} style={{ padding: '6px 12px' }}>
                                ↻ Regenerate
                            </button>
                            {supportsRotation ? (
                                <button
                                    className="rct-button"
                                    onClick={generateAllDirections}
                                    style={{ padding: '6px 16px', fontWeight: 'bold' }}
                                >
                                    ✓ Confirm & Generate All
                                </button>
                            ) : (
                                <button
                                    className="rct-button"
                                    onClick={saveAssets}
                                    style={{ padding: '6px 16px', fontWeight: 'bold' }}
                                >
                                    ✓ Save Asset
                                </button>
                            )}
                        </>
                    )}

                    {isComplete && (
                        <button
                            className="rct-button"
                            onClick={saveAssets}
                            style={{ padding: '6px 16px', fontWeight: 'bold' }}
                        >
                            ✓ Save to Game
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
