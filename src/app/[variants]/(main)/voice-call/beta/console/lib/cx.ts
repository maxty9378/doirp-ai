type ClassValue = false | null | undefined | string | Record<string, boolean>;

export const cx = (...values: ClassValue[]) =>
  values
    .flatMap((value) => {
      if (!value) return [];
      if (typeof value === 'string') return [value];

      return Object.entries(value)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key);
    })
    .join(' ');
