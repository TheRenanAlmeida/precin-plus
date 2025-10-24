import React, { useState, useMemo, useCallback, useRef, useEffect, ChangeEvent, RefObject } from 'react';
import { supabaseUrl, supabaseAnonKey } from './config';
// FIX: Import BRANDS from './types' instead of './constants'.
import { DISTRIBUTOR_BRAND_COLORS } from './constants';
// FIX: Import BRANDS and ProductPrices.
import { BRANDS, type MinPriceInfo, type ComparisonMode, type MarketDataTableProps, type DistributorSelectionPanelProps, type DistributorColors, type ProductData, type FuelPriceRecord, type DailyPriceSummary, type DistributorStyle, type BrandName, type ProductPrices } from './types';

// TypeScript declarations for libraries loaded via CDN
declare const html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
declare const jspdf: any;
declare const supabase: { createClient: (url: string, key: string) => any };
declare const Chart: any;

interface CustomerQuoteTableProps {
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
  onOpenShareModal: () => void;
  isSharing: boolean;
  isSharePreview?: boolean;
}

const calculateIQRAverage = (priceList: number[]): number => {
    const validPrices = priceList.filter(p => typeof p === 'number' && isFinite(p));
    if (validPrices.length === 0) {
        return 0;
    }
    // For small samples, IQR is not robust, so we use a simple average.
    if (validPrices.length < 4) {
        const sum = validPrices.reduce((acc, val) => acc + val, 0);
        const avg = validPrices.length > 0 ? sum / validPrices.length : 0;
        return parseFloat(avg.toFixed(3));
    }

    const sortedPrices = [...validPrices].sort((a, b) => a - b);

    const q1Index = Math.floor(sortedPrices.length / 4);
    const q3Index = Math.floor(sortedPrices.length * (3 / 4));
    const q1 = sortedPrices[q1Index];
    const q3 = sortedPrices[q3Index];

    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filteredPrices = sortedPrices.filter(price => price >= lowerBound && price <= upperBound);

    if (filteredPrices.length === 0) {
        const sum = sortedPrices.reduce((acc, val) => acc + val, 0);
        const avg = sortedPrices.length > 0 ? sum / sortedPrices.length : 0;
        return parseFloat(avg.toFixed(3));
    }

    const sum = filteredPrices.reduce((acc, val) => acc + val, 0);
    const avg = sum / filteredPrices.length;
    return parseFloat(avg.toFixed(3));
};

const stringToHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
};

const generateColorFromString = (str: string) => {
  const hash = stringToHash(str);
  const h = Math.abs(hash) % 360;
  const s = 70;
  const l_bg = 85; 
  const l_text = 30;
  const background = `hsla(${h}, ${s}%, ${l_bg}%, 0.95)`;
  const border = `hsl(${h}, ${s}%, ${l_text}%)`;
  const shadowColor = `hsla(${h}, ${s}%, ${l_bg}%, 0.5)`;
  return { background, border, shadowColor };
};

const findMinPriceInfo = (prices: ProductPrices): MinPriceInfo => {
  if (Object.keys(prices).length === 0) {
      return { minPrice: Infinity, distributors: [] };
  }
  // FIX: Cast Object.values(prices) to number[] to resolve 'unknown' type error in strict mode.
  const minPrice = Math.min(...(Object.values(prices) as number[]));
  const distributors = Object.entries(prices)
    .filter(([, price]) => price === minPrice)
    .map(([distributor]) => distributor);
  return { minPrice, distributors };
};

const Header = () => (
  <header className="bg-[#16a34a] shadow-md sticky top-0 z-50">
    <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-16">
        <div className="flex items-center">
          <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDYiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCAzMDYgNjQiPgogIDxzdHlsZT4KICAgIC5sb2dvIHsgZm9udC1mYW1pbHk6IFBhY2lmaWNvLCBjdXJzaXZlOyBmb250LXNpemU6IDQ4cHg7IGZpbGw6ICNmZmY7IH0KICA8L3N0eWxlPgogIDxyZWN0IHdpZHRoPSIzMDYiIGhlaWdodD0iNjQiIGZpbGw9IiMxNmEzNGEiLz4KICA8dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgY2xhc3M9ImxvZ28iPnByZWNpbis8L3RleHQ+Cjwvc3ZnPg==" alt="precin+" className="h-10 w-auto" />
        </div>
        <div className="hidden md:block">
          <div className="ml-10 flex items-baseline space-x-4">
            <a href="#" className="text-gray-100 hover:bg-green-600 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">HOME</a>
            <a href="#" className="text-gray-100 hover:bg-green-600 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">PREÇOS</a>
            <a href="#" className="text-gray-100 hover:bg-green-600 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">CONTATO</a>
          </div>
        </div>
      </div>
    </nav>
  </header>
);

const Hero = () => (
  <div className="text-center">
    <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
      Acompanhe os melhores preços
    </h1>
    <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">
      Amplie sua vantagem nas negociações. Compare sua cotação com o mercado.
    </p>
  </div>
);

const formatPriceWithConditionalDigits = (price: number): string => {
  const numericPrice = Number(price);
  if (isNaN(numericPrice) || !isFinite(numericPrice)) {
    return '0,00';
  }
  const priceStr = numericPrice.toFixed(3);
  let formattedPrice = priceStr;
  if (priceStr.endsWith('0')) {
    formattedPrice = numericPrice.toFixed(2);
  }
  return formattedPrice.replace('.', ',');
};


const RealTimeClock = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formattedDateTime = new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'America/Sao_Paulo',
    hour12: false
  }).format(currentTime);

  return (
    <div className="text-right">
      <p className="font-semibold text-sm text-gray-700 tabular-nums">{formattedDateTime.replace(',', '')}</p>
      <p className="text-xs text-gray-500">Horário de Brasília</p>
    </div>
  );
};

const CustomerQuoteTable: React.FC<CustomerQuoteTableProps> = ({ 
  allBrandPrices, 
  allBrandPriceInputs,
  handleBrandPriceChange, 
  marketMinPrices,
  averagePrices,
  comparisonMode,
  handleModeToggle,
  onOpenShareModal,
  isSharing,
  quoteTableRef,
  distributorColors,
  products,
  selectedDistributors,
  onDistributorPillClick,
  isSharePreview = false,
  isComparisonMode,
  onComparisonModeToggle,
  onSaveQuote,
  isSaveSuccess,
  activeBrand,
  onActiveBrandChange,
}) => {
  const isAvgMode = comparisonMode === 'avg';

  const ComparisonModeToggle = ({ mode, onToggle }: { mode: ComparisonMode, onToggle: () => void }) => (
      <div onClick={onToggle} className="flex items-center cursor-pointer bg-white rounded-lg shadow-md p-1 font-semibold text-sm transition-all focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-green-400" title="Analisar dados">
          <button className={`px-4 py-1.5 rounded-md transition-colors ${mode === 'min' ? 'bg-green-600 text-white' : 'bg-white text-green-800 hover:bg-gray-50'}`}>
              Mínima
          </button>
          <button className={`px-4 py-1.5 rounded-md transition-colors ${mode === 'avg' ? 'bg-green-600 text-white' : 'bg-white text-green-800 hover:bg-gray-50'}`}>
              Média
          </button>
      </div>
  );

  const BrandHeaderPill = ({ brand }: { brand: BrandName }) => {
    const style = distributorColors[brand] || distributorColors.DEFAULT;
    return (
      <span
        className="inline-block px-3 py-1.5 text-xs font-bold rounded-full distributor-pill"
        style={
          {
            backgroundColor: style.background,
            color: style.border,
            '--shadow-color': style.shadowColor,
          } as React.CSSProperties
        }
      >
        {brand}
      </span>
    );
  };
  
  const renderBrandTabs = () => (
    <div className="px-4 sm:px-6 pb-3 border-b border-gray-200">
      <div className="bg-gray-100 p-1 rounded-lg inline-flex items-center space-x-1" role="tablist" aria-label="Seleção de Bandeira">
        {BRANDS.map((brand) => {
          const style = distributorColors[brand] || distributorColors.DEFAULT;
          const isActive = brand === activeBrand;
          const brandDisplayName = brand === 'Branca/Indefinida' ? 'Branca' : brand;

          const inactiveStyle: React.CSSProperties = {
            backgroundColor: '#fff',
            color: '#166534', // text-green-800
          };

          const activeStyle: React.CSSProperties = {
            backgroundColor: style.background,
            color: style.border,
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          };
          
          const ringColor = isActive ? (style.shadowColor || style.border) : '#16a34a';

          return (
            <button
              key={brand}
              onClick={() => onActiveBrandChange(brand)}
              role="tab"
              aria-selected={isActive}
              className={`whitespace-nowrap py-1.5 px-3 sm:px-4 rounded-md font-bold text-sm transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100`}
              style={{
                  ... (isActive ? activeStyle : inactiveStyle),
                  '--tw-ring-color': ringColor,
              } as React.CSSProperties}
            >
              {brandDisplayName}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderSingleBrandView = () => (
    <table className="w-full text-sm text-left text-gray-700">
      <thead className="text-xs text-white uppercase bg-gradient-to-r from-green-600 to-green-500">
        <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-bold [&>th]:tracking-wider">
          <th scope="col" className="text-left sticky left-0 z-20 bg-green-600 min-w-[140px]">PRODUTO</th>
          <th scope="col" className="text-center min-w-[180px]">
            <BrandHeaderPill brand={activeBrand} />
          </th>
          <th scope="col" className="text-center min-w-[150px] whitespace-nowrap">
            {isAvgMode ? 'PREÇO MÉDIO (R$/L)' : 'MENOR PREÇO (R$/L)'}
          </th>
          <th scope="col" className="text-center min-w-[130px] whitespace-nowrap">DIFERENÇA R$/L</th>
          <th scope="col" className="text-center min-w-[130px] whitespace-nowrap">DIFERENÇA %</th>
          <th scope="col" className="text-center min-w-[220px]">
            {isAvgMode ? 'DISTRIBUIDORAS (MÉDIA)' : 'DISTRIBUIDORAS (MINIMA)'}
          </th>
        </tr>
      </thead>
      <tbody>
        {products.map((produto) => {
          const brandPrice = allBrandPrices[activeBrand]?.[produto] || 0;
          const brandPriceInput = allBrandPriceInputs[activeBrand]?.[produto] ?? '';
          const comparisonPrice = isAvgMode ? (averagePrices[produto] || 0) : (marketMinPrices[produto]?.minPrice || 0);
          const { distributors } = marketMinPrices[produto] || { distributors: [] };
          const difference = brandPrice - comparisonPrice;
          const percentageDifference = comparisonPrice === 0 ? 0 : (difference / comparisonPrice) * 100;
          const isCheaper = difference <= 0;

          let highlightClasses = "bg-gray-50 border-gray-300 text-gray-900";
          const priceEntered = brandPriceInput && brandPrice > 0;

          if (priceEntered && comparisonPrice > 0) {
              highlightClasses = difference <= 0.001 ? "bg-green-200 border-green-500 text-green-900" : "bg-red-100 border-red-500 text-red-900";
          }
          highlightClasses += " focus:border-transparent focus:ring-2 hover:ring-2 focus:shadow-lg hover:shadow-lg transition-all duration-200 ease-in-out";
          if (priceEntered && comparisonPrice > 0) {
              highlightClasses += difference <= 0.001 ? " focus:ring-green-500 hover:ring-green-500 focus:shadow-green-500/40 hover:shadow-green-500/40" : " focus:ring-red-500 hover:ring-red-500 focus:shadow-red-500/40 hover:shadow-red-500/40";
          } else {
              highlightClasses += " focus:ring-gray-400 hover:ring-gray-400 focus:shadow-gray-400/30 hover:shadow-gray-400/30";
          }

          return (
            <tr key={produto} className="align-middle transition-colors hover:bg-gray-50/50 border-b border-gray-200 last:border-b-0">
              <td className="px-4 py-4 font-semibold text-gray-800 whitespace-nowrap sticky left-0 z-10 bg-white hover:bg-gray-50/50 transition-colors">{produto}</td>
              <td className="px-4 py-4 text-center">
                <div className="relative flex justify-center items-center">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={brandPriceInput}
                    onChange={(e) => handleBrandPriceChange(activeBrand, produto, e.target.value)}
                    className={`w-28 h-10 rounded-full p-2 border font-bold text-center relative ${highlightClasses}`}
                  />
                </div>
              </td>
              <td className="px-4 py-4 text-center">
                <span className="inline-flex items-center justify-center w-28 h-10 rounded-full bg-slate-100 font-bold border border-slate-400 text-gray-800">
                  {formatPriceWithConditionalDigits(comparisonPrice)}
                </span>
              </td>
              <td className="px-4 py-4 text-center">
                <span className={`inline-flex items-center justify-center min-w-[80px] h-8 px-3 text-sm font-bold rounded-full ${isCheaper ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {difference > 0 ? '+' : ''}{formatPriceWithConditionalDigits(difference)}
                </span>
              </td>
              <td className="px-4 py-4 text-center">
                <span className={`inline-flex items-center justify-center min-w-[80px] h-8 px-3 text-sm font-bold rounded-full ${isCheaper ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {percentageDifference >= 0 ? '+' : ''}{percentageDifference.toFixed(2)}%
                </span>
              </td>
              {isAvgMode ? (
                produto === products[0] ? (
                  <td className="px-4 py-4 align-middle text-center" rowSpan={products.length}>
                    <div className="grid grid-cols-2 gap-1.5 max-w-[240px] mx-auto">
                      {Array.from(selectedDistributors).sort().map((distributor: string) => (
                        <span key={distributor} onClick={() => onDistributorPillClick?.(distributor)}
                              className="flex items-center justify-center px-3 h-8 text-xs font-bold rounded-full truncate distributor-pill cursor-pointer"
                              style={{ 
                                  backgroundColor: (distributorColors[distributor] || distributorColors.DEFAULT).background, 
                                  color: (distributorColors[distributor] || distributorColors.DEFAULT).border,
                                  '--shadow-color': (distributorColors[distributor] || distributorColors.DEFAULT).shadowColor,
                              } as React.CSSProperties}>
                          {distributor}
                        </span>
                      ))}
                    </div>
                  </td>
                ) : null
              ) : (
                <td className="px-4 py-4 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1 max-w-[200px] mx-auto">
                    {distributors.map((distributor) => (
                      <span key={distributor} onClick={() => onDistributorPillClick?.(distributor)}
                            className="inline-flex items-center justify-center px-3 h-8 text-xs font-bold rounded-full truncate distributor-pill cursor-pointer"
                            style={{ 
                                backgroundColor: (distributorColors[distributor] || distributorColors.DEFAULT).background, 
                                color: (distributorColors[distributor] || distributorColors.DEFAULT).border,
                                '--shadow-color': (distributorColors[distributor] || distributorColors.DEFAULT).shadowColor,
                            } as React.CSSProperties}>
                        {distributor}
                      </span>
                    ))}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderComparisonView = () => {
      const orderedBrands: BrandName[] = [activeBrand, ...BRANDS.filter(b => b !== activeBrand)];
      const formatDifference = (diff: number) => {
        if (Math.abs(diff) < 0.0001) return '0,00';
        
        const diffStr = diff.toFixed(3);
        let formattedStr;

        if (diffStr.endsWith('0')) {
            formattedStr = Number(diff).toFixed(2);
        } else {
            formattedStr = diffStr;
        }

        const sign = diff > 0 ? '+' : '';
        return (sign + formattedStr).replace('.', ',');
      };

      return (
        <table className="w-full text-sm text-left text-gray-700">
            <thead className="text-xs text-white uppercase bg-gradient-to-r from-green-600 to-green-500">
                <tr className="[&>th]:px-2 [&>th]:py-3 [&>th]:font-bold [&>th]:tracking-wider">
                    <th scope="col" className="text-left sticky left-0 z-20 bg-green-600 min-w-[140px] px-4">PRODUTO</th>
                    {orderedBrands.map(brand => (
                        <th key={brand} scope="col" className="text-center min-w-[180px] transition-colors">
                          <BrandHeaderPill brand={brand} />
                        </th>
                    ))}
                    <th scope="col" className="text-center whitespace-nowrap">
                        <div className="inline-flex items-center justify-center rounded-lg" role="group">
                            <span className="bg-green-600 text-white font-bold text-xs px-3 py-1.5 rounded-l-lg">
                                Precin
                            </span>
                            <span className="bg-white text-green-800 font-bold text-xs px-3 py-1.5 rounded-r-lg border-y border-r border-gray-200">
                                {isAvgMode ? 'Média' : 'Mínima'}
                            </span>
                        </div>
                    </th>
                </tr>
            </thead>
            <tbody>
                {products.map((produto) => {
                    const referencePrice = allBrandPrices[activeBrand]?.[produto] || 0;
                    const pricesForProduct = BRANDS.map(b => allBrandPrices[b]?.[produto]).filter(p => p !== undefined && p > 0) as number[];
                    const userMinPrice = pricesForProduct.length > 0 ? Math.min(...pricesForProduct) : 0;
                    const marketComparisonPrice = isAvgMode ? (averagePrices[produto] || 0) : (marketMinPrices[produto]?.minPrice || 0);

                    const marketDifference = (referencePrice > 0 && marketComparisonPrice > 0) ? marketComparisonPrice - referencePrice : null;
                    let marketPillClasses = 'bg-slate-100 border-slate-400 text-gray-800';
                    if (marketDifference !== null) {
                        if (marketDifference < -0.001) {
                            marketPillClasses = 'bg-green-100 text-green-800 border-green-400';
                        } else if (marketDifference > 0.001) {
                            marketPillClasses = 'bg-red-100 text-red-800 border-red-400';
                        }
                    }

                    return (
                        <tr key={produto} className="align-middle transition-colors hover:bg-gray-50/50 border-b border-gray-200 last:border-b-0">
                            <td className="px-4 py-4 font-semibold text-gray-800 whitespace-nowrap sticky left-0 z-10 bg-white hover:bg-gray-50/50 transition-colors">{produto}</td>
                            {orderedBrands.map(brand => {
                                const brandPrice = allBrandPrices[brand]?.[produto] || 0;

                                if (brand === activeBrand) {
                                    const isCheapest = brandPrice > 0 && brandPrice === userMinPrice;
                                    const isMoreExpensive = userMinPrice > 0 && brandPrice > userMinPrice;
                                    const activePillClasses = isCheapest
                                        ? 'bg-green-200 border-green-500 text-green-900'
                                        : isMoreExpensive
                                        ? 'bg-red-100 border-red-500 text-red-900'
                                        : 'bg-gray-50 border-gray-300 text-gray-900';

                                    return (
                                        <td key={brand} className="px-2 py-4 text-center bg-green-50 border-x border-green-200">
                                            <div className="flex justify-center items-center">
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={allBrandPriceInputs[brand]?.[produto] ?? ''}
                                                    onChange={(e) => handleBrandPriceChange(brand, produto, e.target.value)}
                                                    className={`w-28 h-10 rounded-full p-2 border font-bold text-center relative transition-all duration-200 ease-in-out ${activePillClasses} focus:ring-2 focus:ring-green-500 hover:ring-2 hover:ring-green-500`}
                                                />
                                            </div>
                                        </td>
                                    );
                                } else {
                                    const difference = (brandPrice > 0 && referencePrice > 0) ? brandPrice - referencePrice : null;
                                    let inactivePillClasses = 'bg-slate-100 border-slate-400 text-gray-800';
                                    if (difference !== null) {
                                        if (difference < -0.001) {
                                            inactivePillClasses = 'bg-green-100 text-green-800 border-green-400';
                                        } else if (difference > 0.001) {
                                            inactivePillClasses = 'bg-red-100 text-red-800 border-red-400';
                                        }
                                    }

                                    return (
                                        <td key={brand} className="px-2 py-4 text-center">
                                            <div className="flex justify-center items-center gap-1.5">
                                                <span className={`w-28 h-10 rounded-full p-2 border font-bold text-center inline-flex items-center justify-center ${inactivePillClasses}`}>
                                                    {brandPrice > 0 ? formatPriceWithConditionalDigits(brandPrice) : '-'}
                                                </span>
                                                {difference !== null && (
                                                    <span className={`flex-shrink-0 inline-flex items-center justify-center w-14 h-6 text-xs font-bold rounded-full ${difference < -0.001 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {formatDifference(difference)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    );
                                }
                            })}
                            <td className="px-2 py-4 text-center">
                                <div className="flex justify-center items-center gap-1.5">
                                    <span className={`w-28 h-10 rounded-full p-2 border font-bold text-center inline-flex items-center justify-center ${marketPillClasses}`}>
                                        {marketComparisonPrice > 0 ? formatPriceWithConditionalDigits(marketComparisonPrice) : '-'}
                                    </span>
                                    {marketDifference !== null && (
                                        <span className={`flex-shrink-0 inline-flex items-center justify-center w-14 h-6 text-xs font-bold rounded-full ${marketDifference < -0.001 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {formatDifference(marketDifference)}
                                        </span>
                                    )}
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
      );
  };
  
  const renderSharePreview = () => (
    <table className="w-full text-sm text-left text-gray-700 table-fixed">
      <thead className="text-xs text-white uppercase bg-green-600">
        <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-bold [&>th]:tracking-wider">
          <th scope="col" className="text-left bg-green-600 w-[15%]">PRODUTO</th>
          <th scope="col" className="text-center w-[15%]">{activeBrand.toLocaleUpperCase()} (R$/L)</th>
          <th scope="col" className="text-center w-[15%]">{isAvgMode ? 'PREÇO MÉDIO' : 'MENOR PREÇO'}</th>
          <th scope="col" className="text-center w-[12%]">DIFERENÇA R$</th>
          <th scope="col" className="text-center w-[12%]">DIFERENÇA %</th>
          <th scope="col" className="text-center w-[31%]">{isAvgMode ? 'DISTRIBUIDORAS (MÉDIA)' : 'DISTRIBUIDORAS (MINIMA)'}</th>
        </tr>
      </thead>
      <tbody>
        {products.map((produto, index) => {
            const brandPrice = allBrandPrices[activeBrand]?.[produto] || 0;
            const comparisonPrice = isAvgMode ? (averagePrices[produto] || 0) : (marketMinPrices[produto]?.minPrice || 0);
            const { distributors } = marketMinPrices[produto] || { distributors: [] };
            const difference = brandPrice - comparisonPrice;
            const percentageDifference = comparisonPrice === 0 ? 0 : (difference / comparisonPrice) * 100;
            const isCheaper = difference <= 0;
            const highlightClasses = brandPrice > 0 && comparisonPrice > 0 ? (difference <= 0.001 ? "bg-green-200 border-green-500 text-green-900" : "bg-red-100 border-red-500 text-red-900") : "bg-gray-50 border-gray-300 text-gray-900";
            const isLastRow = index === products.length - 1;
            const cellBorderClass = !isLastRow ? 'border-b border-gray-200' : '';
          return (
            <tr key={produto} className={`align-middle ${cellBorderClass}`}>
              <td className="px-4 py-4 font-semibold text-gray-800 whitespace-nowrap bg-white">{produto}</td>
              <td className="px-4 py-4 text-center">
                <span className={`inline-flex items-center justify-center w-32 h-10 rounded-full border font-bold ${highlightClasses}`}>
                  {formatPriceWithConditionalDigits(brandPrice)}
                </span>
              </td>
              <td className="px-4 py-4 text-center">
                <span className="inline-flex items-center justify-center w-32 h-10 rounded-full bg-slate-100 font-bold border border-slate-400 text-gray-800">
                  {formatPriceWithConditionalDigits(comparisonPrice)}
                </span>
              </td>
              <td className="px-4 py-4 text-center">
                <span className={`inline-flex items-center justify-center min-w-[70px] h-8 px-3 text-sm font-bold rounded-full ${isCheaper ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {difference > 0 ? '+' : ''}{formatPriceWithConditionalDigits(difference)}
                </span>
              </td>
              <td className="px-4 py-4 text-center">
                <span className={`inline-flex items-center justify-center min-w-[70px] h-8 px-3 text-sm font-bold rounded-full ${isCheaper ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {percentageDifference >= 0 ? '+' : ''}{percentageDifference.toFixed(2)}%
                </span>
              </td>
              {isAvgMode && index === 0 ? (
                <td className="px-4 py-4 align-middle text-center" rowSpan={products.length}>
                  <div className="grid grid-cols-2 gap-1.5 max-w-[240px] mx-auto p-2">
                    {Array.from(selectedDistributors).sort().map((d: string) => (
                      <span key={d} className="flex items-center justify-center px-3 h-8 text-xs font-bold rounded-full truncate distributor-pill" style={{ backgroundColor: (distributorColors[d] || distributorColors.DEFAULT).background, color: (distributorColors[d] || distributorColors.DEFAULT).border } as React.CSSProperties}>{d}</span>
                    ))}
                  </div>
                </td>
              ) : !isAvgMode && (
                <td className="px-4 py-4 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1 max-w-[200px] mx-auto">
                    {distributors.map((d) => (
                      <span key={d} className="inline-flex items-center justify-center px-3 h-8 text-xs font-bold rounded-full truncate distributor-pill" style={{ backgroundColor: (distributorColors[d] || distributorColors.DEFAULT).background, color: (distributorColors[d] || distributorColors.DEFAULT).border } as React.CSSProperties}>{d}</span>
                    ))}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderComparisonSharePreview = () => {
    const orderedBrands: BrandName[] = [activeBrand, ...BRANDS.filter(b => b !== activeBrand)];
    const formatDifference = (diff: number) => {
        if (Math.abs(diff) < 0.0001) return '0,00';
        const diffStr = diff.toFixed(3);
        let formattedStr;
        if (diffStr.endsWith('0')) {
            formattedStr = Number(diff).toFixed(2);
        } else {
            formattedStr = diffStr;
        }
        const sign = diff > 0 ? '+' : '';
        return (sign + formattedStr).replace('.', ',');
    };

    return (
        <table className="w-full text-sm text-left text-gray-700 table-fixed">
            <thead className="text-xs text-white uppercase bg-green-600">
                <tr className="[&>th]:px-2 [&>th]:py-3 [&>th]:font-bold [&>th]:tracking-wider">
                    <th scope="col" className="text-left bg-green-600 w-[15%] px-4">PRODUTO</th>
                    {orderedBrands.map(brand => (
                        <th key={brand} scope="col" className="text-center w-[15%]">
                            <BrandHeaderPill brand={brand} />
                        </th>
                    ))}
                    <th scope="col" className="text-center w-[25%] whitespace-nowrap">
                        <div className="inline-flex items-center justify-center rounded-lg" role="group">
                            <span className="bg-green-600 text-white font-bold text-xs px-3 py-1.5 rounded-l-lg">
                                Precin
                            </span>
                            <span className="bg-white text-green-800 font-bold text-xs px-3 py-1.5 rounded-r-lg border-y border-r border-gray-200">
                                {isAvgMode ? 'Média' : 'Mínima'}
                            </span>
                        </div>
                    </th>
                </tr>
            </thead>
            <tbody>
                {products.map((produto, index) => {
                    const referencePrice = allBrandPrices[activeBrand]?.[produto] || 0;
                    const pricesForProduct = BRANDS.map(b => allBrandPrices[b]?.[produto]).filter(p => p !== undefined && p > 0) as number[];
                    const userMinPrice = pricesForProduct.length > 0 ? Math.min(...pricesForProduct) : 0;
                    const marketComparisonPrice = isAvgMode ? (averagePrices[produto] || 0) : (marketMinPrices[produto]?.minPrice || 0);

                    const marketDifference = (referencePrice > 0 && marketComparisonPrice > 0) ? marketComparisonPrice - referencePrice : null;
                    let marketPillClasses = 'bg-slate-100 border-slate-400 text-gray-800';
                    if (marketDifference !== null) {
                        if (marketDifference < -0.001) marketPillClasses = 'bg-green-100 text-green-800 border-green-400';
                        else if (marketDifference > 0.001) marketPillClasses = 'bg-red-100 text-red-800 border-red-400';
                    }
                    const cellBorderClass = index < products.length - 1 ? 'border-b border-gray-200' : '';

                    return (
                        <tr key={produto} className={`align-middle ${cellBorderClass}`}>
                            <td className="px-4 py-4 font-semibold text-gray-800 whitespace-nowrap bg-white">{produto}</td>
                            {orderedBrands.map(brand => {
                                const brandPrice = allBrandPrices[brand]?.[produto] || 0;
                                if (brand === activeBrand) {
                                    const isCheapest = brandPrice > 0 && brandPrice === userMinPrice;
                                    const isMoreExpensive = userMinPrice > 0 && brandPrice > userMinPrice;
                                    const activePillClasses = isCheapest ? 'bg-green-200 border-green-500 text-green-900' : isMoreExpensive ? 'bg-red-100 border-red-500 text-red-900' : 'bg-gray-50 border-gray-300 text-gray-900';
                                    return (
                                        <td key={brand} className="px-2 py-4 text-center">
                                            <span className={`inline-flex items-center justify-center w-28 h-10 rounded-full p-2 border font-bold ${activePillClasses}`}>
                                                {brandPrice > 0 ? formatPriceWithConditionalDigits(brandPrice) : '-'}
                                            </span>
                                        </td>
                                    );
                                } else {
                                    const difference = (brandPrice > 0 && referencePrice > 0) ? brandPrice - referencePrice : null;
                                    let inactivePillClasses = 'bg-slate-100 border-slate-400 text-gray-800';
                                    if (difference !== null) {
                                        if (difference < -0.001) inactivePillClasses = 'bg-green-100 text-green-800 border-green-400';
                                        else if (difference > 0.001) inactivePillClasses = 'bg-red-100 text-red-800 border-red-400';
                                    }
                                    return (
                                        <td key={brand} className="px-2 py-4 text-center">
                                            <div className="flex justify-center items-center gap-1.5">
                                                <span className={`inline-flex items-center justify-center w-28 h-10 rounded-full p-2 border font-bold ${inactivePillClasses}`}>
                                                    {brandPrice > 0 ? formatPriceWithConditionalDigits(brandPrice) : '-'}
                                                </span>
                                                {difference !== null && (
                                                    <span className={`flex-shrink-0 inline-flex items-center justify-center w-14 h-6 text-xs font-bold rounded-full ${difference < -0.001 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {formatDifference(difference)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    );
                                }
                            })}
                            <td className="px-2 py-4 text-center">
                                <div className="flex justify-center items-center gap-1.5">
                                    <span className={`inline-flex items-center justify-center w-28 h-10 rounded-full p-2 border font-bold ${marketPillClasses}`}>
                                        {marketComparisonPrice > 0 ? formatPriceWithConditionalDigits(marketComparisonPrice) : '-'}
                                    </span>
                                    {marketDifference !== null && (
                                        <span className={`flex-shrink-0 inline-flex items-center justify-center w-14 h-6 text-xs font-bold rounded-full ${marketDifference < -0.001 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {formatDifference(marketDifference)}
                                        </span>
                                    )}
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
  };


  return (
    <div ref={quoteTableRef} className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <div className={isSharePreview ? "px-6 pt-6 pb-4" : "p-4 sm:p-6 flex justify-between items-center flex-wrap gap-4"}>
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className={isSharePreview ? "text-2xl font-black text-gray-800 tracking-wider" : "text-xl sm:text-2xl font-bold text-gray-800 tracking-wide"}>COTAÇÃO BANDEIRAS</h2>
        </div>
        {!isSharePreview && (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="relative" onClick={onComparisonModeToggle}>
                <input id="comparison-toggle" type="checkbox" className="sr-only peer" checked={isComparisonMode} readOnly />
                <div className="w-12 h-6 bg-gray-200 rounded-full peer-checked:bg-green-100 transition-colors"></div>
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-full peer-checked:bg-green-600"></div>
              </div>
              <label htmlFor="comparison-toggle" className="flex items-center cursor-pointer select-none">
                <span className="text-sm font-semibold text-gray-700">Comparar Bandeiras</span>
              </label>
            </div>
            <ComparisonModeToggle mode={comparisonMode} onToggle={handleModeToggle} />
            <button onClick={onOpenShareModal} disabled={isSharing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-green-800 font-semibold rounded-lg shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 transition-all disabled:opacity-50 disabled:cursor-wait text-sm"
            >
              {isSharing ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="8.59" y1="10.49" x2="15.42" y2="6.51"></line></svg>
              )}
              <span>{isSharing ? 'Enviando...' : 'Compartilhar'}</span>
            </button>
          </div>
        )}
      </div>
       { !isSharePreview && renderBrandTabs() }
      <div className="overflow-x-auto">
        {isSharePreview 
          ? (isComparisonMode ? renderComparisonSharePreview() : renderSharePreview())
          : (isComparisonMode ? renderComparisonView() : renderSingleBrandView())
        }
      </div>
    </div>
  );
};

const MarketDataTable: React.FC<MarketDataTableProps> = ({ marketData, marketMinPrices, distributors, distributorColors, selectedDistributors, highlightedDistributor, marketDate, onDateChange }) => {
  const formatDateForInput = (date: Date): string => {
    // Adjust for timezone offset to display the correct local date in the input
    const adjustedDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return adjustedDate.toISOString().split("T")[0];
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-wide">COTAÇÃO COMPLETA DE MERCADO (BASE DE DADOS)</h2>
          <p className="text-xs text-gray-500 mt-1">
            A célula destacada em cada linha representa o menor preço de mercado entre as distribuidoras selecionadas.
          </p>
        </div>
        <div className="inline-flex items-center rounded-lg shadow-md overflow-hidden focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-green-400">
            <label htmlFor="quote-date-picker" className="cursor-pointer bg-green-600 hover:bg-green-700 text-white font-semibold text-sm px-4 py-2 transition-colors">
                Data
            </label>
            <input
                type="date"
                id="quote-date-picker"
                value={formatDateForInput(marketDate)}
                onChange={onDateChange}
                className="bg-white focus:outline-none text-green-700 font-semibold text-sm py-2 px-3 custom-date-picker-style"
                aria-label="Selecionar data da cotação"
            />
        </div>
      </div>
      <div className="overflow-auto max-h-[60vh] relative">
        <table className="w-full text-sm text-left text-gray-700">
          <thead className="text-xs uppercase bg-slate-100 sticky top-0 z-30">
            <tr>
              <th scope="col" className="px-4 py-3 sticky left-0 bg-slate-100 z-40 font-semibold tracking-wider text-gray-600">PRODUTO</th>
              {distributors.map((distributor) => {
                  const colors = distributorColors[distributor] || distributorColors.DEFAULT;
                  const isDistributorActive = selectedDistributors.has(distributor);
                  return (
                    <th 
                      key={distributor} 
                      scope="col" 
                      className={`px-3 py-3 text-center font-semibold tracking-wider transition-opacity ${!isDistributorActive ? 'opacity-40' : ''} ${highlightedDistributor === distributor ? 'highlight-column' : ''}`}
                      style={{ 
                        backgroundColor: colors.background,
                        color: colors.border
                      }}
                    >
                      {distributor}
                    </th>
                  );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {marketData.length > 0 ? marketData.map(({ produto, prices }) => (
              <tr key={produto} className="hover:bg-slate-50">
                <th scope="row" className="px-4 py-3 font-medium text-gray-900 bg-white whitespace-nowrap sticky left-0 z-20 border-r">{produto}</th>
                {distributors.map((distributor) => {
                  const price = prices[distributor];
                  const isDistributorActive = selectedDistributors.has(distributor);
                  const isMinPriceAmongSelected = price === marketMinPrices[produto]?.minPrice;
                  const isMin = isDistributorActive && isMinPriceAmongSelected;
                  
                  return (
                    <td key={distributor} className={`px-3 py-3 text-center font-bold transition-all duration-200 tabular-nums ${
                        isMin 
                        ? 'bg-green-100 text-green-900 z-10 relative' 
                        : `text-gray-800 ${!isDistributorActive ? 'opacity-40' : ''}`
                    } ${highlightedDistributor === distributor ? 'highlight-column' : ''}`}>
                      {price !== undefined ? formatPriceWithConditionalDigits(price) : '-'}
                    </td>
                  );
                })}
              </tr>
            )) : (
              <tr>
                <td colSpan={distributors.length + 1} className="text-center py-10 text-gray-500">
                  Nenhum dado de mercado encontrado para a data selecionada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DistributorSelectionPanel: React.FC<DistributorSelectionPanelProps> = ({
  allDistributors,
  selectedDistributors,
  onSelectionChange,
  onSelectAll,
  onClearAll,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Filtro de Distribuidoras</h3>
          <p className="text-sm text-gray-600">Selecione as Distribuidoras para incluir nos cálculos de Média e Mínima.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400">
            Selecionar Todas
          </button>
          <button onClick={onClearAll} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400">
            Limpar Seleção
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {allDistributors.map(distributor => {
          const isSelected = selectedDistributors.has(distributor);
          return (
            <label
              key={distributor}
              htmlFor={`distributor-filter-${distributor}`}
              className={`
                flex items-center gap-2 cursor-pointer py-2 px-3 rounded-full
                border text-sm font-medium transition-all duration-200 select-none
                ${isSelected 
                  ? 'bg-green-50 border-green-400 text-green-800 shadow-sm' 
                  : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-700'
                }
              `}
            >
              <input
                id={`distributor-filter-${distributor}`}
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelectionChange(distributor, !isSelected)}
                className="sr-only"
              />
              <div className={`
                w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-all
                ${isSelected 
                  ? 'bg-green-600 border-green-600' 
                  : 'bg-white border-2 border-gray-300'
                }
              `}>
                {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                )}
              </div>
              <span className="truncate">{distributor}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

// --- CHART UTILS AND COMPONENTS ---

const weekendIndicatorPlugin = {
  id: 'weekendIndicator',
  afterDatasetsDraw(chart: any) {
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    if (!chart.data.labels || chart.data.labels.length === 0) return;
    ctx.save();
    
    const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
    });

    for (let i = 1; i < chart.data.labels.length; i++) {
      const label = chart.data.labels[i] as string;
      const currentDate = new Date(`${label.substring(0, 10)}T12:00:00Z`);
      const currentDayString = dayOfWeekFormatter.format(currentDate);
      
      if (currentDayString === 'Mon') {
        const prevDataPointIndex = i - 1;
        const xPos = (x.getPixelForValue(prevDataPointIndex) + x.getPixelForValue(i)) / 2;

        ctx.beginPath();
        ctx.moveTo(xPos, top);
        ctx.lineTo(xPos, bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.6)';
        ctx.setLineDash([3, 3]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
};

const getChartOptions = (title: string, isModal: boolean = false, chartData: any = null) => {
  const tooltipColors = [
    'rgba(239, 68, 68, 0.8)', // Máximo
    'rgba(59, 130, 246, 0.8)', // Médio
    'rgba(34, 197, 94, 0.8)',  // Mínimo
  ];

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest' as const,
      intersect: true,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: isModal ? 14 : 10 },
          boxWidth: isModal ? 30 : 20,
          boxHeight: isModal ? 14 : 10,
          padding: 20,
          usePointStyle: false,
        },
      },
      title: {
        display: true,
        text: title,
        font: {
          size: isModal ? 20 : 16,
          weight: 'bold' as const,
        },
        color: '#334155',
      },
      tooltip: {
        enabled: true,
        backgroundColor: (context: any) => {
          if (context.tooltip.dataPoints.length > 0) {
            const index = context.tooltip.dataPoints[0].datasetIndex;
            return tooltipColors[index] || 'rgba(15, 23, 42, 0.8)';
          }
          return 'rgba(15, 23, 42, 0.8)';
        },
        titleFont: { size: isModal ? 14 : 12, weight: 'bold' as const },
        bodyFont: { size: isModal ? 16 : 14, weight: 'bold' as const },
        padding: isModal ? 12 : 10,
        displayColors: false,
        callbacks: {
          title: (context: any) => {
            const dataPoint = context[0];
            if (dataPoint?.label) {
              const label = dataPoint.label;
              const date = new Date(`${label.substring(0, 10)}T12:00:00Z`);
              return date.toLocaleDateString('pt-BR', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              });
            }
            return '';
          },
          label: (context: any) => {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
            }
            return label;
          },
        },
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number) => 'R$ ' + value.toFixed(2),
          font: { size: isModal ? 12 : 10 },
        },
        min: 0,
        max: 0,
      },
      x: {
        grid: { display: false },
        ticks: { 
          font: { size: isModal ? 12 : 10 },
          callback: function(this: any, value: number) {
            const label = this.chart.data.labels[value] as string;
            if (label) {
              const date = new Date(`${label.substring(0, 10)}T12:00:00Z`);
              return date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'UTC'
              });
            }
            return '';
          }
        },
      },
    },
    elements: {
        point: {
            radius: isModal ? 4 : 3,
            hoverRadius: isModal ? 6 : 5,
            hitRadius: 15,
        }
    }
  };

  if (chartData?.datasets) {
    const allDataPoints = chartData.datasets.flatMap((dataset: any) => dataset.data);
    const validDataPoints = allDataPoints.filter((p: number | null) => p !== null && isFinite(p));
    if (validDataPoints.length > 0) {
      const dataMin = Math.min(...validDataPoints);
      const dataMax = Math.max(...validDataPoints);
      const range = dataMax - dataMin;
      
      let stepSize = 0.02;
      if (range > 0.7) {
          stepSize = 0.08;
      } else if (range > 0.3) {
          stepSize = 0.04;
      }
      
      const paddedMin = (Math.floor(dataMin / stepSize) * stepSize) - stepSize;
      const paddedMax = (Math.ceil(dataMax / stepSize) * stepSize) + stepSize;

      options.scales.y.min = Math.max(0, paddedMin);
      options.scales.y.max = paddedMax;
      options.scales.y.ticks.stepSize = stepSize;
    }
  }

  return options;
};

const PriceEvolutionChart: React.FC<{
  title: string;
  chartData: any;
  onExpand?: () => void;
  isCarouselItem?: boolean;
  isCenter?: boolean;
}> = ({ title, chartData, onExpand, isCarouselItem = false, isCenter = false }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (chartRef.current && chartData) {
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
        }

        const ctx = chartRef.current.getContext('2d');
        if (ctx) {
            chartInstanceRef.current = new Chart(ctx, {
                type: 'line',
                data: chartData,
                options: getChartOptions(title, false, chartData),
                plugins: [weekendIndicatorPlugin],
            });
        }
    }

    return () => {
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
            chartInstanceRef.current = null;
        }
    };
  }, [chartData, title]);


  return (
    <div
      className={`bg-white rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 relative transition-all duration-300 ${isCarouselItem ? 'h-full' : 'h-80'} ${isCenter ? 'cursor-pointer' : ''}`}
      onClick={onExpand}
    >
      <canvas ref={chartRef}></canvas>
    </div>
  );
};

const ChartModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  chartData: any;
}> = ({ isOpen, onClose, title, chartData }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);

  useEffect(() => {
    let timeoutId: number | undefined;
    if (isOpen && chartRef.current && chartData) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
      
      timeoutId = window.setTimeout(() => {
          const ctx = chartRef.current?.getContext('2d');
          if (ctx) {
            chartInstanceRef.current = new Chart(ctx, {
              type: 'line',
              data: chartData,
              options: getChartOptions(title, true, chartData),
              plugins: [weekendIndicatorPlugin],
            });
          }
      }, 50);

    }

    return () => {
      clearTimeout(timeoutId);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [isOpen, chartData, title]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <header className="p-2 border-b border-gray-200 flex justify-end items-center">
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </header>
            <div className="flex-grow p-4 sm:p-6 relative">
                <canvas ref={chartRef}></canvas>
            </div>
        </div>
    </div>
  );
};

const ChartCarousel: React.FC<{
  products: string[];
  chartData: { [key: string]: any };
  onChartExpand: (fuelType: string) => void;
}> = ({ products, chartData, onChartExpand }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);
  
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const dragThreshold = useRef(5);
  const pointerDownSlideIndex = useRef<number | null>(null);

  const goToSlide = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const goToNext = useCallback(() => {
    setActiveIndex((prevIndex) => (prevIndex + 1) % products.length);
  }, [products.length]);

  const goToPrev = useCallback(() => {
    setActiveIndex((prevIndex) => (prevIndex - 1 + products.length) % products.length);
  }, [products.length]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (products.length <= 1) return;
    
    const slideElement = (e.target as HTMLElement)?.closest('[data-slide-index]');
    pointerDownSlideIndex.current = slideElement ? parseInt(slideElement.getAttribute('data-slide-index') || '-1', 10) : null;

    isDragging.current = true;
    dragStartX.current = e.clientX;
    setDragOffset(0);
    setIsTransitioning(false);
    if (carouselRef.current) carouselRef.current.style.cursor = 'grabbing';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setDragOffset(e.clientX - dragStartX.current);
  };

  const handlePointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsTransitioning(true);

    if (carouselRef.current) carouselRef.current.style.cursor = 'grab';
    
    if (Math.abs(dragOffset) < dragThreshold.current) {
        const slideIndex = pointerDownSlideIndex.current;
        if (slideIndex !== null && slideIndex !== -1) {
            if (slideIndex === activeIndex) {
                onChartExpand(products[activeIndex]);
            } else {
                goToSlide(slideIndex);
            }
        }
    } else {
        const swipeThreshold = 50; 
        if (dragOffset > swipeThreshold) goToPrev();
        else if (dragOffset < -swipeThreshold) goToNext();
    }
    
    setDragOffset(0);
    pointerDownSlideIndex.current = null;
  };
  
  useEffect(() => {
    const carouselElement = carouselRef.current;
    const preventContextMenu = (e: Event) => e.preventDefault();
    if (carouselElement) {
      carouselElement.addEventListener('contextmenu', preventContextMenu);
      return () => carouselElement.removeEventListener('contextmenu', preventContextMenu);
    }
  }, []);

  return (
    <div className="relative w-full h-[350px] flex items-center justify-center">
      <button 
        onClick={goToPrev} 
        className="absolute left-0 sm:-left-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-white/60 backdrop-blur-sm shadow-lg hover:bg-white/90 transition-all disabled:opacity-50"
        aria-label="Gráfico Anterior"
        disabled={products.length <= 1}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-800"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
      </button>

      <div 
        ref={carouselRef}
        className="relative w-full h-full overflow-hidden touch-pan-y"
        style={{ perspective: '1500px', transformStyle: 'preserve-3d', cursor: products.length > 1 ? 'grab' : 'default' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {products.map((fuelType, index) => {
          const numProducts = products.length;
          const carouselWidth = carouselRef.current?.offsetWidth || window.innerWidth;
          
          let offset = index - activeIndex;
          if (numProducts > 2) { 
            if (offset > numProducts / 2) offset -= numProducts;
            if (offset < -numProducts / 2) offset += numProducts;
          }

          const dragProgress = isTransitioning ? 0 : dragOffset / carouselWidth;
          const effectiveOffset = offset - dragProgress;
          const absEffectiveOffset = Math.abs(effectiveOffset);

          if (absEffectiveOffset > 2) return <div key={fuelType} style={{ display: 'none' }} />;

          const scale = 1 - 0.2 * Math.min(absEffectiveOffset, 2);
          const translateZ = -150 * Math.min(absEffectiveOffset, 2);
          const rotateY = -40 * effectiveOffset;
          const opacity = Math.max(0, 1 - 0.5 * absEffectiveOffset);
          const translateX = effectiveOffset * 65;

          const style: React.CSSProperties = {
            transform: `translateX(${translateX}%) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
            opacity: opacity,
            zIndex: products.length - Math.round(absEffectiveOffset),
            transition: isTransitioning ? 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease' : 'none',
            position: 'absolute', width: '60%', height: '100%', top: 0, left: '20%',
            pointerEvents: !isDragging.current ? 'auto' : 'none',
          };

          return (
            <div key={fuelType} style={style} data-slide-index={index}>
              <PriceEvolutionChart title={fuelType} chartData={chartData[fuelType]} isCarouselItem={true} isCenter={offset === 0} />
            </div>
          );
        })}
      </div>

      <button 
        onClick={goToNext} 
        className="absolute right-0 sm:-right-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-white/60 backdrop-blur-sm shadow-lg hover:bg-white/90 transition-all disabled:opacity-50"
        aria-label="Próximo Gráfico"
        disabled={products.length <= 1}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-800"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
      </button>
    </div>
  );
};

const ShareModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    isSharing: boolean;
    executeShareAction: (action: (element: HTMLElement) => Promise<any>, elementToCapture: HTMLElement | null) => void;
    shareActions: {
      handleDownloadJPG: (element: HTMLElement) => Promise<void>;
      handleDownloadPDF: (element: HTMLElement) => Promise<void>;
      handleWebShare: (element: HTMLElement) => Promise<void>;
    }
    allBrandPrices: { [key in BrandName]?: { [product: string]: number } };
    allBrandPriceInputs: { [key in BrandName]?: { [product: string]: string } };
    marketMinPrices: { [product: string]: MinPriceInfo };
    averagePrices: { [product: string]: number };
    comparisonMode: ComparisonMode;
    distributorColors: DistributorColors;
    products: string[];
    allDistributors: string[];
    selectedDistributors: Set<string>;
    activeBrand: BrandName;
    isComparisonMode: boolean;
}> = ({ 
    isOpen, onClose, isSharing, executeShareAction, shareActions,
    allBrandPrices, allBrandPriceInputs, marketMinPrices, averagePrices, 
    comparisonMode, distributorColors, products, 
    allDistributors, selectedDistributors, activeBrand, isComparisonMode
}) => {
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const { handleDownloadJPG, handleDownloadPDF, handleWebShare } = shareActions;
    
    const ShareHeader = () => {
        const formattedDateTime = new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: 'America/Sao_Paulo',
        }).format(new Date());

        return (
            <div className="mb-6 flex justify-between items-start border-b border-gray-200 pb-4">
                <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDYiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCAzMDYgNjQiPgogIDxzdHlsZT4KICAgIC5sb2dvIHsgZm9udC1mYW1pbHk6IFBhY2lmaWNvLCBjdXJzaXZlOyBmb250LXNpemU6IDQ4cHg7IGZpbGw6ICNmZmY7IH0KICA8L3N0eWxlPgogIDxyZWN0IHdpZHRoPSIzMDYiIGhlaWdodD0iNjQiIGZpbGw9IiMxNmEzNGEiLz4KICA8dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgY2xhc3M9ImxvZ28iPnByZWNpbis8L3RleHQ+Cjwvc3ZnPg==" alt="precin+" className="w-48" />
                <div className="text-right">
                    <p className="font-semibold text-sm text-gray-700">{formattedDateTime}</p>
                    <p className="text-xs text-gray-500">Horário de Brasília</p>
                </div>
            </div>
        );
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Compartilhar Cotação</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                
                <div className="flex-grow p-6 bg-gray-100 overflow-auto">
                    {/* Off-screen container for clean rendering */}
                    <div className="fixed -left-[9999px] top-0 p-8 bg-white w-[1200px]" ref={previewContainerRef}>
                         <ShareHeader />
                         <div className="space-y-8">
                            <CustomerQuoteTable
                                allBrandPrices={allBrandPrices}
                                allBrandPriceInputs={allBrandPriceInputs}
                                handleBrandPriceChange={() => {}}
                                handleModeToggle={() => {}}
                                onOpenShareModal={() => {}}
                                onSaveQuote={() => {}}
                                isSharing={false}
                                quoteTableRef={null}
                                isSharePreview={true}
                                marketMinPrices={marketMinPrices}
                                averagePrices={averagePrices}
                                comparisonMode={comparisonMode}
                                distributorColors={distributorColors}
                                products={products}
                                allDistributors={allDistributors}
                                selectedDistributors={selectedDistributors}
                                isComparisonMode={isComparisonMode}
                                onComparisonModeToggle={() => {}}
                                isSaveSuccess={false}
                                activeBrand={activeBrand}
                                onActiveBrandChange={() => {}}
                            />
                        </div>
                    </div>
                    {/* Visible container for user preview */}
                    <div className="p-8 bg-white">
                        <ShareHeader />
                        <div className="space-y-8">
                            <CustomerQuoteTable
                                allBrandPrices={allBrandPrices}
                                allBrandPriceInputs={allBrandPriceInputs}
                                handleBrandPriceChange={() => {}}
                                handleModeToggle={() => {}}
                                onOpenShareModal={() => {}}
                                onSaveQuote={() => {}}
                                isSharing={false}
                                quoteTableRef={null}
                                isSharePreview={true}
                                marketMinPrices={marketMinPrices}
                                averagePrices={averagePrices}
                                comparisonMode={comparisonMode}
                                distributorColors={distributorColors}
                                products={products}
                                allDistributors={allDistributors}
                                selectedDistributors={selectedDistributors}
                                isComparisonMode={isComparisonMode}
                                onComparisonModeToggle={() => {}}
                                isSaveSuccess={false}
                                activeBrand={activeBrand}
                                onActiveBrandChange={() => {}}
                            />
                        </div>
                    </div>
                </div>

                <footer className="p-4 border-t border-gray-200 flex justify-end items-center gap-3 bg-gray-50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50">Cancelar</button>
                    <button onClick={() => executeShareAction(handleDownloadJPG, previewContainerRef.current)} disabled={isSharing} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 disabled:bg-blue-300">Baixar JPG</button>
                    <button onClick={() => executeShareAction(handleDownloadPDF, previewContainerRef.current)} disabled={isSharing} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg shadow-sm hover:bg-red-700 disabled:bg-red-300">Baixar PDF</button>
                    {navigator.share && <button onClick={() => executeShareAction(handleWebShare, previewContainerRef.current)} disabled={isSharing} className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg shadow-sm hover:bg-green-700 disabled:bg-green-300">Compartilhar</button>}
                </footer>
            </div>
        </div>
    );
};

const RankingSidebar: React.FC<{
  products: string[];
  onProductSelect: (product: string) => void;
  activeProduct: string | null;
}> = ({ products, onProductSelect, activeProduct }) => {
  const productOrder = ['Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel S10', 'Diesel S500'];
  const sortedProducts = [...products].sort((a, b) => productOrder.indexOf(a) - productOrder.indexOf(b));
  
  const productAbbreviations: { [key: string]: string } = {
    'Gasolina Comum': 'GC',
    'Gasolina Aditivada': 'GA',
    'Etanol': 'E',
    'Diesel S10': 'S10',
    'Diesel S500': 'S500',
  };

  return (
    <div className="fixed left-0 top-1/2 -translate-y-1/2 z-40">
      <ul className="space-y-2">
        {sortedProducts.map(product => {
          const isActive = activeProduct === product;
          return (
            <li key={product} title={product}>
              <button
                onClick={() => onProductSelect(product)}
                className={`
                  w-14 h-12 flex items-center justify-center cursor-pointer shadow-lg
                  font-bold text-sm relative
                  rounded-r-full transition-all duration-200
                  border border-green-400
                  text-green-800
                  hover:scale-110 hover:ring-2 hover:ring-green-400 hover:z-50
                  focus:outline-none focus:scale-110 focus:ring-2 focus:ring-green-400 focus:z-50
                  ${isActive
                    ? 'bg-green-100'
                    : 'bg-green-50 hover:bg-green-100'
                  }
                `}
              >
                {productAbbreviations[product] || product.charAt(0)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const RankingDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  product: string | null;
  marketData: ProductData[];
  distributorColors: DistributorColors;
}> = ({ isOpen, onClose, product, marketData, distributorColors }) => {
  const rankedPrices = useMemo(() => {
    if (!product) return [];
    const productData = marketData.find(p => p.produto === product);
    if (!productData) return [];

    const sortedPrices = Object.entries(productData.prices)
      .filter(([, price]) => price !== null && price !== undefined && typeof price === 'number')
      .sort(([, a], [, b]) => (a as number) - (b as number)) as [string, number][];

    if (sortedPrices.length === 0) return [];

    const rankedList: { distributor: string; price: number; rank: number }[] = [];
    let rank = 0;
    let lastPrice = -Infinity;

    sortedPrices.forEach(([distributor, price]) => {
      if (price > lastPrice) {
        rank++;
      }
      rankedList.push({ distributor, price, rank });
      lastPrice = price;
    });

    return rankedList;
  }, [product, marketData]);

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      ></div>
      <div 
        className={`fixed top-0 left-0 h-full w-80 sm:w-96 bg-gray-50 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-r border-green-400 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {product && (
          <div className="flex flex-col h-full">
            <header className="p-4 border-b border-gray-200 flex justify-between items-center bg-white sticky top-0">
              <h2 className="text-lg font-bold text-gray-800 truncate">Ranking: {product}</h2>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </header>
            <ul className="flex-grow overflow-y-auto p-2 space-y-2 overflow-x-hidden">
              {rankedPrices.map(({ distributor, price, rank }) => {
                const style = distributorColors[distributor] || distributorColors.DEFAULT;
                let rankColor = 'bg-gray-200 text-gray-700';
                if (rank === 1) rankColor = 'bg-yellow-400 text-yellow-900';
                if (rank === 2) rankColor = 'bg-gray-300 text-gray-800';
                if (rank === 3) rankColor = 'bg-orange-400 text-orange-900';

                return (
                  <li 
                    key={distributor} 
                    className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm border border-gray-200 transition-transform duration-200 ease-in-out hover:scale-105 hover:ring-2 hover:ring-green-400 hover:z-10 hover:relative"
                  >
                    <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rankColor}`}>
                      {rank}º
                    </span>
                    <span 
                      className="flex-grow px-3 py-1.5 text-sm font-bold rounded-full text-center truncate distributor-pill"
                      style={{ 
                        backgroundColor: style.background, 
                        color: style.border,
                        '--shadow-color': style.shadowColor,
                      } as React.CSSProperties}
                    >
                      {distributor}
                    </span>
                    <span className="flex-shrink-0 text-base font-bold text-green-700">
                      R$ {price.toFixed(2)}
                    </span>
                  </li>
                );
              })}
              {rankedPrices.length === 0 && (
                <li className="text-center text-gray-500 p-8">
                  Nenhum preço encontrado para este produto.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </>
  );
};

// Initial data for presentation/demo purposes
const initialPricesForDemo: { [key in BrandName]?: { [product: string]: number } } = {
  'Shell': {
    'Gasolina Comum': 5.253,
    'Gasolina Aditivada': 5.426,
    'Etanol': 3.815,
    'Diesel S10': 5.429,
    'Diesel S500': 5.349,
  },
  'Vibra': {
    'Gasolina Comum': 5.266,
    'Gasolina Aditivada': 5.411,
    'Etanol': 3.827,
    'Diesel S10': 5.456,
    'Diesel S500': 0,
  },
  'Ipiranga': {
    'Gasolina Comum': 5.27,
    'Gasolina Aditivada': 5.28,
    'Etanol': 3.75,
    'Diesel S10': 5.47,
    'Diesel S500': 5.37,
  }
};

const initialInputsForDemo: { [key in BrandName]?: { [product: string]: string } } = {
  'Shell': {
    'Gasolina Comum': '5,253',
    'Gasolina Aditivada': '5,426',
    'Etanol': '3,815',
    'Diesel S10': '5,429',
    'Diesel S500': '5,349',
  },
  'Vibra': {
    'Gasolina Comum': '5,266',
    'Gasolina Aditivada': '5,411',
    'Etanol': '3,827',
    'Diesel S10': '5,456',
    'Diesel S500': '',
  },
  'Ipiranga': {
    'Gasolina Comum': '5,27',
    'Gasolina Aditivada': '5,28',
    'Etanol': '3,75',
    'Diesel S10': '5,47',
    'Diesel S500': '5,37',
  }
};

export default function App() {
  const [allBrandPrices, setAllBrandPrices] = useState<{ [key in BrandName]?: { [product: string]: number } }>({});
  const [allBrandPriceInputs, setAllBrandPriceInputs] = useState<{ [key in BrandName]?: { [product: string]: string } }>({});
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('min');
  
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const quoteTableRef = useRef<HTMLDivElement>(null);
  const marketTableRef = useRef<HTMLDivElement>(null);
  
  const [marketData, setMarketData] = useState<ProductData[]>([]);
  const [distributors, setDistributors] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [distributorColors, setDistributorColors] = useState<DistributorColors>({
      DEFAULT: { background: 'rgba(75, 85, 99, 0.95)', border: '#ffffff', shadowColor: 'rgba(75, 85, 99, 0.5)' }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDistributors, setSelectedDistributors] = useState<Set<string>>(new Set());
  const [priceEvolutionData, setPriceEvolutionData] = useState<{ [key: string]: DailyPriceSummary[] }>({});
  const [rankingProduct, setRankingProduct] = useState<string | null>(null);
  const [highlightedDistributor, setHighlightedDistributor] = useState<string | null>(null);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [isSaveSuccess, setIsSaveSuccess] = useState(false);
  const [activeBrand, setActiveBrand] = useState<BrandName>(BRANDS[0]);
  const [marketDate, setMarketDate] = useState(new Date());
  const [debouncedMarketDate, setDebouncedMarketDate] = useState(marketDate);
  
  const allPossibleDistributors = useMemo(() => Object.keys(DISTRIBUTOR_BRAND_COLORS).sort(), []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedMarketDate(marketDate);
    }, 800);

    return () => {
      clearTimeout(handler);
    };
  }, [marketDate]);

  useEffect(() => {
    async function fetchAllData() {
      setIsLoading(true);
      setError(null);
      if (!supabaseUrl || !supabaseAnonKey) {
        setError('As credenciais do Supabase não foram configuradas. Por favor, adicione a URL e a chave anônima no arquivo config.ts.');
        setIsLoading(false);
        return;
      }
      
      const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

      const today = new Date();
      const isToday = today.toDateString() === debouncedMarketDate.toDateString();
      
      let pricesPromise;
      if (isToday) {
        pricesPromise = supabaseClient.from('todays_fuel_prices').select('fuel_type, distribuidora:Distribuidora, price').eq('Base', 'Betim - MG');
      } else {
        // Prepare for future integration with historical data.
        // When a historical view is available, this will be replaced with a query
        // using .gte() and .lte() on a date column.
        pricesPromise = Promise.resolve({ data: [], error: null });
      }

      const evolutionPromise = supabaseClient
        .from('resumo_diario_mes_atual')
        .select('created_at, dia, fuel_type, avg_price, min_price, max_price')
        .eq('Base', 'Betim - MG')
        .gte('created_at', '2025-10-01')
        .order('created_at', { ascending: true });

      const [pricesResult, evolutionResult] = await Promise.all([pricesPromise, evolutionPromise]);

      if (pricesResult.error || evolutionResult.error) {
        const errorMessages = [pricesResult.error && `preços diários (${pricesResult.error.message})`, evolutionResult.error && `histórico de preços (${evolutionResult.error.message})`].filter(Boolean);
        setError(`Ocorreu um erro ao buscar os dados: ${errorMessages.join('; ')}.`);
        console.error('Supabase fetch error:', { pricesError: pricesResult.error, evolutionError: evolutionResult.error });
      } else {
        const rawData: FuelPriceRecord[] = pricesResult.data;
        const productMap = new Map<string, ProductPrices>();
        const distributorSet = new Set<string>();
        const productSet = new Set<string>();

        rawData.forEach(record => {
            // FIX: Access `distribuidora` directly from the typed record.
            const distributorName = record.distribuidora;
            if (!record.fuel_type || !distributorName || record.price === null) return;
            if (!productMap.has(record.fuel_type)) productMap.set(record.fuel_type, {});
            productMap.get(record.fuel_type)![distributorName] = record.price;
            distributorSet.add(distributorName);
            productSet.add(record.fuel_type);
        });

        const productOrder = ['Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel S10', 'Diesel S500'];
        const customSort = (a: string, b: string) => {
          const indexA = productOrder.indexOf(a), indexB = productOrder.indexOf(b);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1; if (indexB !== -1) return 1;
          return a.localeCompare(b);
        };
        
        const newProducts = Array.from(productSet).sort(customSort);
        const newDistributors = Array.from(distributorSet).sort();
        const sortedMarketData = Array.from(productMap.entries()).map(([produto, prices]) => ({ produto, prices })).sort((a, b) => customSort(a.produto, b.produto));

        const brandColorKeys = Object.keys(DISTRIBUTOR_BRAND_COLORS);
        const fetchedColors = allPossibleDistributors.reduce((acc: DistributorColors, name: string) => {
          const brandKey = brandColorKeys.find(key => key.toLowerCase() === name.toLowerCase());
          let style: Partial<DistributorStyle> = brandKey ? { ...DISTRIBUTOR_BRAND_COLORS[brandKey] } : generateColorFromString(name);
          style.background = (style.background || 'rgba(100, 116, 139, 0.95)').replace(/, ?\d?\.?\d+\)$/, ', 0.95)');
          if (!style.shadowColor) style.shadowColor = style.background.replace(/, ?0.95\)$/, ', 0.5)');
          acc[name] = style as DistributorStyle;
          return acc;
        }, { DEFAULT: { background: 'rgba(75, 85, 99, 0.95)', border: '#ffffff', shadowColor: 'rgba(75, 85, 99, 0.5)' } });
        
        setMarketData(sortedMarketData);
        setDistributors(newDistributors);
        setProducts(newProducts);
        setDistributorColors(fetchedColors);
        // Only reset selection if the data is for a new day, otherwise keep user selection
        if (isToday) {
            setSelectedDistributors(prev => prev.size > 0 ? prev : new Set(newDistributors));
        } else {
            setSelectedDistributors(new Set(newDistributors));
        }


        // Load persisted brand prices or use demo data
        try {
            const savedPrices = localStorage.getItem('precinPlusBrandPrices');
            const savedInputs = localStorage.getItem('precinPlusBrandInputs');
            const pricesToSet = savedPrices ? JSON.parse(savedPrices) : initialPricesForDemo;
            const inputsToSet = savedInputs ? JSON.parse(savedInputs) : initialInputsForDemo;
            setAllBrandPrices(pricesToSet);
            setAllBrandPriceInputs(inputsToSet);
        } catch (e) {
            console.error("Failed to load prices from localStorage", e);
            setAllBrandPrices(initialPricesForDemo);
            setAllBrandPriceInputs(initialInputsForDemo);
        }

        const groupedByFuel = (evolutionResult.data || []).reduce((acc: { [key: string]: DailyPriceSummary[] }, record: DailyPriceSummary) => {
            const { fuel_type } = record;
            if (!acc[fuel_type]) acc[fuel_type] = [];
            acc[fuel_type].push(record);
            return acc;
// FIX: Explicitly cast the initial value of the `reduce` method. This ensures the result is correctly typed, preventing downstream type inference issues that cause indexing and method call errors.
        }, {} as { [key: string]: DailyPriceSummary[] });
        
        for (const fuelType in groupedByFuel) {
          groupedByFuel[fuelType].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        }

        setPriceEvolutionData(groupedByFuel);
      }
      setIsLoading(false);
    }
    fetchAllData();
  }, [allPossibleDistributors, debouncedMarketDate]);

  const marketMinPrices = useMemo(() => {
    return marketData.reduce((acc, { produto, prices }) => {
      const filteredPrices: ProductPrices = {};
      for (const distributor of selectedDistributors) {
          if (prices[distributor] !== undefined) filteredPrices[distributor] = prices[distributor];
      }
      acc[produto] = findMinPriceInfo(filteredPrices);
      return acc;
    }, {} as { [product: string]: MinPriceInfo });
  }, [marketData, selectedDistributors]);
  
  const dynamicAveragePrices = useMemo(() => {
    return marketData.reduce((acc, { produto, prices }) => {
        const priceList = Array.from(selectedDistributors).map(d => prices[d]).filter(p => p !== undefined && p !== null) as number[];
        acc[produto] = calculateIQRAverage(priceList);
        return acc;
    }, {} as {[product: string]: number});
  }, [marketData, selectedDistributors]);

  const formattedChartData = useMemo(() => {
    const chartDataSets: { [key: string]: any } = {};
    // FIX: Refactored to use `Object.entries` for typesafe iteration over `priceEvolutionData`, resolving an index type error. This is a safer alternative to `for...in` in strict TypeScript.
    for (const [fuelType, data] of Object.entries(priceEvolutionData)) {
      chartDataSets[fuelType] = {
        labels: data.map(d => d.created_at),
        datasets: [
          { label: 'Preço Máximo', data: data.map(d => d.max_price), borderColor: 'rgb(239, 68, 68)', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.2, borderWidth: 2 },
          { label: 'Preço Médio', data: data.map(d => d.avg_price), borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.2, borderWidth: 2 },
          { label: 'Preço Mínimo', data: data.map(d => d.min_price), borderColor: 'rgb(34, 197, 94)', backgroundColor: 'rgba(34, 197, 94, 0.1)', tension: 0.2, borderWidth: 2 },
        ]
      };
    }
    return chartDataSets;
  }, [priceEvolutionData]);


  const handleBrandPriceChange = useCallback((brand: BrandName, product: string, value: string) => {
    let digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits === '') {
      setAllBrandPriceInputs(p => ({ ...p, [brand]: { ...p[brand], [product]: '' } }));
      setAllBrandPrices(p => ({ ...p, [brand]: { ...p[brand], [product]: 0 } }));
      return;
    }
    const formattedValue = digits.length > 1 ? `${digits.slice(0, 1)},${digits.slice(1)}` : digits;
    const price = parseInt(digits.padEnd(4, '0'), 10) / 1000;
    
    setAllBrandPriceInputs(p => ({ ...p, [brand]: { ...p[brand], [product]: formattedValue } }));
    setAllBrandPrices(p => ({ ...p, [brand]: { ...p[brand], [product]: price } }));
  }, []);
  
  const handleModeToggle = useCallback(() => setComparisonMode(p => p === 'min' ? 'avg' : 'min'), []);
  const handleComparisonModeToggle = useCallback(() => setIsComparisonMode(p => !p), []);
  const handleActiveBrandChange = useCallback((brand: BrandName) => setActiveBrand(brand), []);
  
  const handleDistributorSelection = useCallback((distributor: string, isSelected: boolean) => {
    setSelectedDistributors(prev => {
      const newSet = new Set(prev);
      if (isSelected) newSet.add(distributor); else newSet.delete(distributor);
      return newSet;
    });
  }, []);

  const handleSelectAllDistributors = useCallback(() => setSelectedDistributors(new Set(distributors)), [distributors]);
  const handleClearAllDistributors = useCallback(() => setSelectedDistributors(new Set()), []);
  
  const handleSaveQuote = useCallback(() => {
    try {
        localStorage.setItem('precinPlusBrandPrices', JSON.stringify(allBrandPrices));
        localStorage.setItem('precinPlusBrandInputs', JSON.stringify(allBrandPriceInputs));
        setIsSaveSuccess(true);
        setTimeout(() => setIsSaveSuccess(false), 2000);
    } catch (e) {
        console.error("Failed to save prices to localStorage", e);
        alert("Não foi possível salvar os preços.");
    }
  }, [allBrandPrices, allBrandPriceInputs]);

  const executeShareAction = async (action: (element: HTMLElement) => Promise<any>, elementToCapture: HTMLElement | null) => {
    if (!elementToCapture) return alert("Ocorreu um erro: elemento para captura não encontrado.");
    setIsSharing(true);
    try {
      await action(elementToCapture);
    } catch (error: any) {
      console.error("Share/Download Error:", error);
      if (error.name !== 'AbortError') alert("Ocorreu um erro ao tentar compartilhar.");
    } finally {
      setIsSharing(false);
    }
  };

  const handleDownloadJPG = async (element: HTMLElement) => {
      const canvas = await html2canvas(element, { useCORS: true, scale: 2, windowWidth: element.scrollWidth, windowHeight: element.scrollHeight });
      const link = document.createElement('a');
      link.download = 'cotacao.jpg';
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
  };

  const handleDownloadPDF = async (element: HTMLElement) => {
      const { jsPDF } = jspdf;
      const canvas = await html2canvas(element, { useCORS: true, scale: 2, windowWidth: element.scrollWidth, windowHeight: element.scrollHeight });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('cotacao.pdf');
  };

  const handleWebShare = async (element: HTMLElement) => {
      if (!navigator.share) return alert("Seu navegador não suporta compartilhamento nativo.");
      const canvas = await html2canvas(element, { useCORS: true, scale: 2, windowWidth: element.scrollWidth, windowHeight: element.scrollHeight });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Não foi possível criar a imagem para compartilhar.");

      const file = new File([blob], 'cotacao.png', { type: 'image/png' });
      const shareData = { title: 'Cotação de Combustível', text: 'Confira a cotação de combustível.', files: [file] };

      if (navigator.canShare && navigator.canShare(shareData)) await navigator.share(shareData);
      else throw new Error("Não foi possível compartilhar este conteúdo.");
  };
  
  const handleRankingProductSelect = (product: string) => setRankingProduct(p => (p === product ? null : product));
  
  const handleDistributorPillClick = useCallback((distributor: string) => {
    if (marketTableRef.current) {
        marketTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedDistributor(distributor);
        setTimeout(() => setHighlightedDistributor(null), 2500);
    }
  }, []);
  
  const handleChartExpand = (fuelType: string) => setExpandedChart(fuelType);
  const handleChartClose = () => setExpandedChart(null);
  
  const handleMarketDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const dateString = event.target.value;
    // Create date object in UTC to avoid timezone issues with date-only inputs
    const date = new Date(dateString + 'T00:00:00');
    setMarketDate(date);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <div className="text-center">
          <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-green-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <p className="text-lg font-semibold text-gray-700">Carregando dados do mercado...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50 p-4">
        <div className="text-center p-8 bg-red-50 border-2 border-red-200 text-red-800 rounded-xl shadow-lg max-w-lg">
          <h2 className="text-2xl font-bold mb-4">Erro de Conexão</h2>
          <p className="text-base">{error}</p>
          <p className="mt-4 text-sm text-red-700">Por favor, verifique o arquivo `config.ts`, sua conexão com a internet e as permissões da sua view no Supabase.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans antialiased text-gray-900">
      <Header />
      <RankingSidebar products={products} onProductSelect={handleRankingProductSelect} activeProduct={rankingProduct} />
      <main className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
            <Hero />
            <div className="flex justify-end -mb-6 sm:-mb-4 -mr-2 sm:-mr-0">
                <RealTimeClock />
            </div>
            <CustomerQuoteTable 
                allBrandPrices={allBrandPrices} 
                allBrandPriceInputs={allBrandPriceInputs}
                handleBrandPriceChange={handleBrandPriceChange}
                marketMinPrices={marketMinPrices}
                averagePrices={dynamicAveragePrices}
                comparisonMode={comparisonMode}
                handleModeToggle={handleModeToggle}
                onOpenShareModal={() => setIsShareModalOpen(true)}
                isSharing={isSharing}
                quoteTableRef={quoteTableRef}
                distributorColors={distributorColors}
                products={products}
                allDistributors={allPossibleDistributors}
                selectedDistributors={selectedDistributors}
                onDistributorPillClick={handleDistributorPillClick}
                isComparisonMode={isComparisonMode}
                onComparisonModeToggle={handleComparisonModeToggle}
                onSaveQuote={handleSaveQuote}
                isSaveSuccess={isSaveSuccess}
                activeBrand={activeBrand}
                onActiveBrandChange={handleActiveBrandChange}
            />
            {(comparisonMode === 'avg' || comparisonMode === 'min') && (
              <DistributorSelectionPanel
                  allDistributors={distributors}
                  selectedDistributors={selectedDistributors}
                  onSelectionChange={handleDistributorSelection}
                  onSelectAll={handleSelectAllDistributors}
                  onClearAll={handleClearAllDistributors}
                  distributorColors={distributorColors}
              />
            )}
            <div ref={marketTableRef} className="scroll-mt-20">
                <MarketDataTable 
                    marketData={marketData}
                    marketMinPrices={marketMinPrices} 
                    distributors={distributors}
                    distributorColors={distributorColors}
                    selectedDistributors={selectedDistributors}
                    highlightedDistributor={highlightedDistributor}
                    marketDate={marketDate}
                    onDateChange={handleMarketDateChange}
                />
            </div>
            <div className="space-y-8 pb-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-wide text-center">Evolução de Preços - Base Betim/MG</h2>
                <ChartCarousel
                    products={Object.keys(formattedChartData).sort((a, b) => products.indexOf(a) - products.indexOf(b))}
                    chartData={formattedChartData}
                    onChartExpand={handleChartExpand}
                />
            </div>
        </div>
      </main>
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        isSharing={isSharing}
        executeShareAction={executeShareAction}
        shareActions={{ handleDownloadJPG, handleDownloadPDF, handleWebShare }}
        allBrandPrices={allBrandPrices}
        allBrandPriceInputs={allBrandPriceInputs}
        marketMinPrices={marketMinPrices}
        averagePrices={dynamicAveragePrices}
        comparisonMode={comparisonMode}
        distributorColors={distributorColors}
        products={products}
        allDistributors={allPossibleDistributors}
        selectedDistributors={selectedDistributors}
        activeBrand={activeBrand}
        isComparisonMode={isComparisonMode}
      />
      <RankingDrawer
        isOpen={rankingProduct !== null}
        onClose={() => setRankingProduct(null)}
        product={rankingProduct}
        marketData={marketData}
        distributorColors={distributorColors}
      />
      <ChartModal
        isOpen={expandedChart !== null}
        onClose={handleChartClose}
        title={expandedChart ? `Evolução de Preços: ${expandedChart}` : ''}
        chartData={expandedChart ? formattedChartData[expandedChart] : null}
      />
    </div>
  );
}