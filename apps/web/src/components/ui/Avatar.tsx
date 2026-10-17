interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' };

export default function Avatar({ src, name, size = 'md' }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover ring-2 ring-white`}
      />
    );
  }

  return (
    <div
      className={`${sizes[size]} rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center ring-2 ring-white`}
    >
      {initials}
    </div>
  );
}
