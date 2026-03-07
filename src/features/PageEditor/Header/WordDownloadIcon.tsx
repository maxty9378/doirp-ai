import { memo } from 'react';

export const WordDownloadIcon = memo(() => (
  <svg
    fill="none"
    height="1em"
    viewBox="0 0 100 100"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    style={{ transform: 'scale(1.5)' }}
  >
    <style>
      {`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(3px); }
        }
        @keyframes pulse {
          0% { opacity: 1; stroke-width: 2; }
          50% { opacity: 0.7; stroke-width: 3; }
          100% { opacity: 1; stroke-width: 2; }
        }
        .arrow-group {
          animation: bounce 1.5s ease-in-out infinite;
        }
        .download-circle {
          animation: pulse 2s ease-in-out infinite;
          transform-origin: 75px 75px;
        }
      `}
    </style>

    {/* Фон документа (синий прямоугольник со скругленными углами) */}
    <rect fill="#2B579A" height="70" rx="4" width="60" x="20" y="15" />

    {/* Загнутый уголок */}
    <path d="M60 15L80 35H64C61.7909 35 60 33.2091 60 31V15Z" fill="#B0C4DE" />

    {/* Буква W */}
    <path
      d="M35 40L40 60L45 40L50 60L55 40"
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="4"
    />

    {/* Круг для индикатора загрузки */}
    <circle
      className="download-circle"
      cx="75"
      cy="75"
      fill="white"
      r="20"
      stroke="#2B579A"
      strokeWidth="2"
    />

    {/* Анимированная стрелка скачивания */}
    <g transform="translate(67, 67) scale(0.8)">
      <g className="arrow-group">
        <path
          d="M10 2V12M10 12L6 8M10 12L14 8"
          stroke="#2B579A"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </g>
      <path d="M4 16H16" stroke="#2B579A" strokeLinecap="round" strokeWidth="3" />
    </g>
  </svg>
));

WordDownloadIcon.displayName = 'WordDownloadIcon';
