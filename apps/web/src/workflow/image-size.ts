export const IMAGE_SIZE_PRESETS = [
  { ratio: "1:1", width: 2048, height: 2048 },
  { ratio: "3:2", width: 2496, height: 1664 },
  { ratio: "4:3", width: 2304, height: 1728 },
  { ratio: "16:9", width: 2560, height: 1440 },
  { ratio: "21:9", width: 3024, height: 1296 },
  { ratio: "2:3", width: 1664, height: 2496 },
  { ratio: "3:4", width: 1728, height: 2304 },
  { ratio: "9:16", width: 1440, height: 2560 },
] as const;

export const DEFAULT_IMAGE_RATIO = IMAGE_SIZE_PRESETS[0].ratio;

export function imageRequestSize(storedSize?: string) {
  const size = storedSize || DEFAULT_IMAGE_RATIO;
  const preset = IMAGE_SIZE_PRESETS.find(({ ratio }) => ratio === size);
  return preset ? `${preset.width}x${preset.height}` : size;
}

export function imageRatio(width: number, height: number) {
  if (!(width > 0 && height > 0)) return DEFAULT_IMAGE_RATIO;
  const target = width / height;
  let closest: (typeof IMAGE_SIZE_PRESETS)[number] = IMAGE_SIZE_PRESETS[0];
  let distance = Infinity;
  for (const preset of IMAGE_SIZE_PRESETS) {
    const next = Math.abs(Math.log(preset.width / preset.height / target));
    if (next < distance) {
      closest = preset;
      distance = next;
    }
  }
  return closest.ratio;
}
