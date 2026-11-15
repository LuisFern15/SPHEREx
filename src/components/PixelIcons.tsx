import React from 'react';

interface IconProps {
  className?: string;
}

/**
 * Logotipo de la matriz de seis detectores SPHEREx (3x2 bloques de 8 px, B1-B6).
 */
export const SpherexLogo: React.FC<IconProps> = ({ className }) => (
  <svg
    width="28"
    height="18"
    viewBox="0 0 28 18"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="0" y="0" width="8" height="8" fill="#7aa2ff" />
    <rect x="10" y="0" width="8" height="8" fill="#3be0d0" />
    <rect x="20" y="0" width="8" height="8" fill="#7bf06a" />
    <rect x="0" y="10" width="8" height="8" fill="#ffe14d" />
    <rect x="10" y="10" width="8" height="8" fill="#ff9b3d" />
    <rect x="20" y="10" width="8" height="8" fill="#ff4d6d" />
  </svg>
);

export const PixelSearchIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="2" y="1" width="4" height="1" />
    <rect x="1" y="2" width="1" height="4" />
    <rect x="6" y="2" width="1" height="4" />
    <rect x="2" y="6" width="4" height="1" />
    <rect x="6" y="6" width="1" height="1" />
    <rect x="7" y="7" width="1" height="1" />
    <rect x="8" y="8" width="1" height="1" />
  </svg>
);

export const PixelTerminalIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="0" y="1" width="10" height="1" />
    <rect x="0" y="8" width="10" height="1" />
    <rect x="0" y="2" width="1" height="6" />
    <rect x="9" y="2" width="1" height="6" />
    <rect x="2" y="3" width="1" height="1" />
    <rect x="3" y="4" width="1" height="1" />
    <rect x="2" y="5" width="1" height="1" />
    <rect x="5" y="6" width="3" height="1" />
  </svg>
);

export const PixelRefreshIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="2" y="1" width="5" height="1" />
    <rect x="6" y="0" width="1" height="1" />
    <rect x="7" y="1" width="1" height="1" />
    <rect x="6" y="2" width="1" height="1" />
    <rect x="1" y="2" width="1" height="3" />
    <rect x="8" y="5" width="1" height="3" />
    <rect x="3" y="8" width="5" height="1" />
    <rect x="3" y="7" width="1" height="1" />
    <rect x="2" y="8" width="1" height="1" />
    <rect x="3" y="9" width="1" height="1" />
  </svg>
);

export const PixelEyeIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="3" y="2" width="4" height="1" />
    <rect x="1" y="3" width="2" height="1" />
    <rect x="7" y="3" width="2" height="1" />
    <rect x="0" y="4" width="1" height="2" />
    <rect x="9" y="4" width="1" height="2" />
    <rect x="1" y="6" width="2" height="1" />
    <rect x="7" y="6" width="2" height="1" />
    <rect x="3" y="7" width="4" height="1" />
    <rect x="4" y="4" width="2" height="2" />
  </svg>
);

export const PixelLayersIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="1" y="1" width="6" height="2" />
    <rect x="2" y="4" width="6" height="2" />
    <rect x="3" y="7" width="6" height="2" />
  </svg>
);

export const PixelPinIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="3" y="1" width="4" height="2" />
    <rect x="4" y="3" width="2" height="2" />
    <rect x="2" y="5" width="6" height="1" />
    <rect x="4" y="6" width="2" height="3" />
  </svg>
);

export const PixelRotateCcwIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="3" y="1" width="5" height="1" />
    <rect x="8" y="2" width="1" height="5" />
    <rect x="3" y="7" width="5" height="1" />
    <rect x="2" y="2" width="1" height="3" />
    <rect x="1" y="4" width="3" height="1" />
    <rect x="2" y="5" width="1" height="1" />
  </svg>
);

export const PixelZoomInIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="2" y="0" width="4" height="1" />
    <rect x="1" y="1" width="1" height="1" />
    <rect x="6" y="1" width="1" height="1" />
    <rect x="0" y="2" width="1" height="4" />
    <rect x="7" y="2" width="1" height="4" />
    <rect x="1" y="6" width="1" height="1" />
    <rect x="6" y="6" width="1" height="1" />
    <rect x="2" y="7" width="4" height="1" />
    <rect x="2" y="3" width="4" height="2" />
    <rect x="3" y="2" width="2" height="4" />
    <rect x="7" y="7" width="1" height="1" />
    <rect x="8" y="8" width="2" height="2" />
  </svg>
);

export const PixelZoomOutIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="2" y="0" width="4" height="1" />
    <rect x="1" y="1" width="1" height="1" />
    <rect x="6" y="1" width="1" height="1" />
    <rect x="0" y="2" width="1" height="4" />
    <rect x="7" y="2" width="1" height="4" />
    <rect x="1" y="6" width="1" height="1" />
    <rect x="6" y="6" width="1" height="1" />
    <rect x="2" y="7" width="4" height="1" />
    <rect x="2" y="3" width="4" height="2" />
    <rect x="7" y="7" width="1" height="1" />
    <rect x="8" y="8" width="2" height="2" />
  </svg>
);

export const PixelChevronLeftIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="6" y="1" width="2" height="1" />
    <rect x="5" y="2" width="2" height="1" />
    <rect x="4" y="3" width="2" height="1" />
    <rect x="3" y="4" width="2" height="2" />
    <rect x="4" y="6" width="2" height="1" />
    <rect x="5" y="7" width="2" height="1" />
    <rect x="6" y="8" width="2" height="1" />
  </svg>
);

export const PixelChevronRightIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="2" y="1" width="2" height="1" />
    <rect x="3" y="2" width="2" height="1" />
    <rect x="4" y="3" width="2" height="1" />
    <rect x="5" y="4" width="2" height="2" />
    <rect x="4" y="6" width="2" height="1" />
    <rect x="3" y="7" width="2" height="1" />
    <rect x="2" y="8" width="2" height="1" />
  </svg>
);

export const PixelPlayIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="2" y="1" width="2" height="8" />
    <rect x="4" y="2" width="2" height="6" />
    <rect x="6" y="3" width="1" height="4" />
    <rect x="7" y="4" width="1" height="2" />
  </svg>
);

export const PixelPauseIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="2" y="1" width="2" height="8" />
    <rect x="6" y="1" width="2" height="8" />
  </svg>
);

export const PixelRepeatIcon: React.FC<IconProps> = ({ className }) => (
  <svg
    viewBox="0 0 10 10"
    fill="currentColor"
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={className}
  >
    <rect x="1" y="2" width="7" height="1" />
    <rect x="7" y="1" width="1" height="1" />
    <rect x="8" y="2" width="1" height="1" />
    <rect x="7" y="3" width="1" height="1" />
    <rect x="8" y="4" width="1" height="2" />
    <rect x="2" y="7" width="7" height="1" />
    <rect x="2" y="6" width="1" height="1" />
    <rect x="1" y="7" width="1" height="1" />
    <rect x="2" y="8" width="1" height="1" />
    <rect x="1" y="4" width="1" height="2" />
  </svg>
);