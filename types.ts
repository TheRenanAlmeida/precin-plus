import type { ChangeEvent, RefObject } from 'react';

export type ComparisonMode = 'min' | 'avg';
export type PostoName = 'AGUA FRESCA' | 'CAMINHO NOVO' | 'SANTA MARIA' | 'FENIX';

export interface DistributorStyle {
  background: string;
  border: string;
  shadowColor?: string;
}

export interface DistributorColors {
  [key: string]: DistributorStyle;
}

export interface ProductPrices {
  [distributor: string]: number;
}

export interface ProductData {
  produto: string;
  prices: ProductPrices;
}

export interface MinPriceInfo {
  minPrice: number;
  distributors: string[];
}

export interface CustomerPrices {
    [product: string]: number;
}

export interface ShareActions {
  isShareOpen: boolean;
  isSharing: boolean;
  toggleShare: () => void;
  handleDownloadJPG: () => void;
  handleDownloadPDF: () => void;
  handleWebShare: () => void;
}

export interface DistributorConfig {
  Name: string;
}

export interface FuelPriceRecord {
  fuel_type: string;
  Distribuidora: string;
  price: number;
  Base: string;
}

export interface DailyPriceSummary {
  created_at: string;
  dia: string;
  fuel_type: string;
  preco_medio: number;
  preco_minimo: number;
  preco_maximo: number;
}

export interface CustomerQuoteTableProps {
  customerPrices: CustomerPrices;
  customerPriceInputs: { [product: string]: string; };
  handlePriceChange: (product: string, value: string) => void;
  marketMinPrices: { [product: string]: MinPriceInfo };
  averagePrices: { [product: string]: number };
  comparisonMode: ComparisonMode;
  handleModeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  selectedPosto: PostoName;
  handlePostoChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  quoteTableRef: RefObject<HTMLDivElement> | null;
  distributorColors: DistributorColors;
  products: string[];
  selectedQuoteDistributor: string | undefined;
  onQuoteDistributorChange: (distributor: string) => void;
  allDistributors: string[];
  selectedDistributors: Set<string>;
  onDistributorPillClick?: (distributor: string) => void;
  isVolumeMode: boolean;
  onVolumeModeToggle: () => void;
  volumes: { [product: string]: string; };
  onVolumeChange: (product: string, value: string) => void;
}

export interface MarketDataTableProps {
    marketData: ProductData[];
    marketMinPrices: { [product: string]: MinPriceInfo };
    distributors: string[];
    distributorColors: DistributorColors;
    selectedDistributors: Set<string>;
    highlightedDistributor: string | null;
}

export interface DistributorSelectionPanelProps {
  allDistributors: string[];
  selectedDistributors: Set<string>;
  onSelectionChange: (distributor: string, isSelected: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  distributorColors: DistributorColors;
}