// Image processing utilities for game assets
// Handles fetching, transforming, and saving generated images

export interface ProcessedImage {
    data: Buffer | Uint8Array;
    width: number;
    height: number;
    format: 'png' | 'gif';
}

export interface ImageProcessingOptions {
    targetWidth?: number;
    targetHeight?: number;
    removeBackground?: boolean;
    format?: 'png' | 'gif';
}

/**
 * Fetch image from URL and return as blob/buffer
 */
export async function fetchImage(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }
    return response.blob();
}

/**
 * Convert base64 string to Blob
 */
export function base64ToBlob(base64: string, mimeType: string = 'image/png'): Blob {
    // Remove data URL prefix if present
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}

/**
 * Convert Blob to base64 data URL
 */
export async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Create an image element from a blob
 */
export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = reject;
        img.src = url;
    });
}

/**
 * Resize image using canvas
 * Centers the image on a larger canvas if needed (for game asset format)
 */
export async function resizeImage(
    imageBlob: Blob,
    targetWidth: number = 512,
    targetHeight: number = 512,
    centerOnCanvas: boolean = true
): Promise<Blob> {
    const img = await blobToImage(imageBlob);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

    // Clear canvas (transparent)
    ctx.clearRect(0, 0, targetWidth, targetHeight);

    if (centerOnCanvas) {
        // Calculate scale to fit image within canvas while maintaining aspect ratio
        const scale = Math.min(
            targetWidth / img.width,
            targetHeight / img.height
        ) * 0.9; // Leave 10% margin

        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // Center horizontally, place at bottom (for isometric building anchoring)
        const x = (targetWidth - scaledWidth) / 2;
        const y = targetHeight - scaledHeight;

        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
    } else {
        // Stretch to fill
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create blob from canvas'));
            }
        }, 'image/png');
    });
}

/**
 * Apply transparency to white/near-white backgrounds
 * Simple threshold-based background removal
 */
export async function removeWhiteBackground(
    imageBlob: Blob,
    threshold: number = 240
): Promise<Blob> {
    const img = await blobToImage(imageBlob);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if pixel is near-white
        if (r >= threshold && g >= threshold && b >= threshold) {
            data[i + 3] = 0; // Set alpha to 0 (transparent)
        }
    }

    ctx.putImageData(imageData, 0, 0);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to create blob from canvas'));
            }
        }, 'image/png');
    });
}

/**
 * Process an image through the full pipeline
 */
export async function processGameAsset(
    imageBlob: Blob,
    options: ImageProcessingOptions = {}
): Promise<Blob> {
    let processed = imageBlob;

    // Remove white background if requested
    if (options.removeBackground) {
        processed = await removeWhiteBackground(processed);
    }

    // Resize to target dimensions
    if (options.targetWidth || options.targetHeight) {
        processed = await resizeImage(
            processed,
            options.targetWidth || 512,
            options.targetHeight || 512
        );
    }

    return processed;
}

/**
 * Generate filename for a building asset
 */
export function generateBuildingFilename(
    buildingId: string,
    footprint: { width: number; height: number },
    direction: string
): string {
    return `${footprint.width}x${footprint.height}${buildingId}_${direction}.png`;
}

/**
 * Generate path for saving a building asset
 */
export function getBuildingAssetPath(
    category: string,
    filename: string
): string {
    return `/Building/${category}/${filename}`;
}

/**
 * Generate filename for a character asset
 */
export function generateCharacterFilename(
    characterName: string,
    direction: string
): string {
    return `${characterName}walk${direction}.gif`;
}

/**
 * Generate path for saving a character asset
 */
export function getCharacterAssetPath(filename: string): string {
    return `/Characters/${filename}`;
}

/**
 * Generate filename for a prop asset
 */
export function generatePropFilename(
    propId: string,
    footprint: { width: number; height: number },
    direction?: string
): string {
    if (direction) {
        return `${footprint.width}x${footprint.height}${propId}_${direction}.png`;
    }
    return `${footprint.width}x${footprint.height}${propId}.png`;
}

/**
 * Generate path for saving a prop asset
 */
export function getPropAssetPath(filename: string): string {
    return `/Props/${filename}`;
}
