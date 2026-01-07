import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export async function GET() {
    try {
        const publicDir = join(process.cwd(), 'public');
        const generatedDir = join(publicDir, 'generated');

        if (!existsSync(generatedDir)) {
            return NextResponse.json({ buildings: [] });
        }

        const files = await readdir(generatedDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        const buildings = await Promise.all(
            jsonFiles.map(async (file) => {
                try {
                    const content = await readFile(join(generatedDir, file), 'utf-8');
                    return JSON.parse(content);
                } catch (e) {
                    console.error(`Failed to read ${file}`, e);
                    return null;
                }
            })
        );

        // Filter out any failed reads
        const validBuildings = buildings.filter(b => b !== null);

        return NextResponse.json({ buildings: validBuildings });
    } catch (error) {
        console.error('Error listing assets:', error);
        return NextResponse.json(
            { error: 'Failed to list assets' },
            { status: 500 }
        );
    }
}
