import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const assetId = formData.get('assetId') as string;
        const assetType = formData.get('assetType') as string;
        const definitionStr = formData.get('definition') as string;

        if (!assetId || !assetType) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const publicDir = join(process.cwd(), 'public');
        const savedPaths: string[] = [];

        // Process each sprite file
        const entries = Array.from(formData.entries());
        for (const [key, value] of entries) {
            if (key.startsWith('sprite_') && value instanceof Blob) {
                const direction = key.replace('sprite_', '');
                const pathKey = `path_${direction}`;
                const relativePath = formData.get(pathKey) as string;

                if (!relativePath) continue;

                // Construct the full file path
                const fullPath = join(publicDir, relativePath);
                const dirPath = join(fullPath, '..');

                // Ensure directory exists
                if (!existsSync(dirPath)) {
                    await mkdir(dirPath, { recursive: true });
                }

                // Convert blob to buffer and write
                const arrayBuffer = await value.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                await writeFile(fullPath, buffer);

                savedPaths.push(relativePath);
            }
        }

        // Optionally save building definition for later registration
        if (definitionStr) {
            const generatedDir = join(publicDir, 'generated');
            if (!existsSync(generatedDir)) {
                await mkdir(generatedDir, { recursive: true });
            }

            const definitionPath = join(generatedDir, `${assetId}.json`);
            await writeFile(definitionPath, definitionStr);
        }

        return NextResponse.json({
            success: true,
            savedPaths,
            message: `Saved ${savedPaths.length} sprites for ${assetId}`
        });
    } catch (error) {
        console.error('Error saving asset:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
