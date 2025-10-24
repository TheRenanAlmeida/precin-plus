import type { ChangeEvent, RefObject } from 'react';

export const BRANDS = ['Shell', 'Ipiranga', 'Vibra', 'Branca/Indefinida'] as const;
export type BrandName = typeof BRANDS[number];

export type ComparisonMode = 'min' | 'avg';

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
  // FIX: Renamed from Distribuidora to match query alias
  distribuidora: string;
  price: number;
  // FIX: Base is not selected in the query, so it's removed from the type.
}

export interface DailyPriceSummary {
  created_at: string;
  dia: string;
  fuel_type: string;
  // FIX: Update property names to match Supabase query aliases (e.g., avg_price).
  avg_price: number;
  min_price: number;
  max_price: number;
}

export interface CustomerQuoteTableProps {
  allBrandPrices: { [key in BrandName]?: { [product: string]: number } };
  allBrandPriceInputs: { [key in BrandName]?: { [product:string]: string } };
  handleBrandPriceChange: (brand: BrandName, product: string, value: string) => void;
  marketMinPrices: { [product: string]: MinPriceInfo };
  averagePrices: { [product: string]: number };
  comparisonMode: ComparisonMode;
  handleModeToggle: () => void;
  quoteTableRef: RefObject<HTMLDivElement> | null;
  distributorColors: DistributorColors;
  products: string[];
  allDistributors: string[];
  selectedDistributors: Set<string>;
  onDistributorPillClick?: (distributor: string) => void;
  isComparisonMode: boolean;
  onComparisonModeToggle: () => void;
  onSaveQuote: () => void;
  isSaveSuccess: boolean;
  activeBrand: BrandName;
  onActiveBrandChange: (brand: BrandName) => void;
}

export interface MarketDataTableProps {
    marketData: ProductData[];
    marketMinPrices: { [product: string]: MinPriceInfo };
    distributors: string[];
    distributorColors: DistributorColors;
    selectedDistributors: Set<string>;
    highlightedDistributor: string | null;
    marketDate: Date;
    onDateChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export interface DistributorSelectionPanelProps {
  allDistributors: string[];
  selectedDistributors: Set<string>;
  onSelectionChange: (distributor: string, isSelected: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  distributorColors: DistributorColors;
}