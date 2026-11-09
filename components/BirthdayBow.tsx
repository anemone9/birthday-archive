type BirthdayBowProps = { className?: string; variant?: 'satin' | 'illustrated' };

export default function BirthdayBow({ className = '', variant = 'satin' }: BirthdayBowProps) {
  if (variant === 'illustrated') {
    return (
      <svg className={className} viewBox="0 0 64 42" aria-hidden="true">
        <path d="M30 19C20 7 7 5 4 11c-4 7 7 17 23 20l6-8Zm4 4 6 8c16-3 27-13 23-20-3-6-16-4-26 8" fill="#df8ea6" stroke="#a76479" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M30 22 18 37l-2-10 10-7m12 2 10 15 2-10-10-7" fill="#ebabc0" stroke="#a76479" strokeWidth="1.4" strokeLinejoin="round"/>
        <circle cx="32" cy="22" r="5.5" fill="#f4c6d4" stroke="#a76479" strokeWidth="1.5"/>
        <path d="M11 13q5 4 10 5m32-5q-5 4-10 5" fill="none" stroke="#f9dce5" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }

  return (
    <img
      className={className}
      src="/birthday-satin-bow.webp"
      alt=""
      aria-hidden="true"
      width={600}
      height={450}
      decoding="async"
    />
  );
}
