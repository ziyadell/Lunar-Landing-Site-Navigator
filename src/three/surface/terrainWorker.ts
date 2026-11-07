/// <reference lib="webworker" />
import { buildRadialMesh, type TerrainRegion, type TerrainTiles } from './terrainMesh';

self.onmessage = (e: MessageEvent<{ id: number; region: TerrainRegion; tiles: TerrainTiles; segments: number }>) => {
  const { id, region, tiles, segments } = e.data;
  try {
    const m = buildRadialMesh(region, tiles, segments);
    (self as unknown as Worker).postMessage({ id, mesh: m }, [m.position.buffer, m.uv.buffer, m.stereo.buffer, m.color.buffer, m.normal.buffer, m.index.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
