import React, { useState, useMemo, useCallback, useRef, useEffect, ChangeEvent, RefObject } from 'react';
import { supabaseUrl, supabaseAnonKey } from './config';
import { POSTO_PRICES, DISTRIBUTOR_BRAND_COLORS } from './constants';
import type { ProductPrices, MinPriceInfo, CustomerPrices, ComparisonMode, CustomerQuoteTableProps as OriginalCustomerQuoteTableProps, MarketDataTableProps, PostoName, DistributorSelectionPanelProps, DistributorColors, ProductData, FuelPriceRecord, DailyPriceSummary, DistributorStyle } from './types';

// TypeScript declarations for libraries loaded via CDN
declare const html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
declare const jspdf: any;
declare const supabase: { createClient: (url: string, key: string) => any };
declare const Chart: any;


interface CustomerQuoteTableProps extends Omit<OriginalCustomerQuoteTableProps, 'shareActions' | 'quoteTableRef'> {
    onOpenShareModal: () => void;
    isSharing: boolean;
    quoteTableRef: RefObject<HTMLDivElement> | null;
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

    // Using simplified percentile method for quartiles
    const q1Index = Math.floor(sortedPrices.length / 4);
    const q3Index = Math.floor(sortedPrices.length * (3 / 4));

    const q1 = sortedPrices[q1Index];
    const q3 = sortedPrices[q3Index];

    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filteredPrices = sortedPrices.filter(price => price >= lowerBound && price <= upperBound);

    if (filteredPrices.length === 0) {
        // Fallback: if all data is filtered out, return simple average of the original list.
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
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

const generateColorFromString = (str: string) => {
  const hash = stringToHash(str);
  const h = Math.abs(hash) % 360; // Hue
  const s = 70; // Saturation
  const l_bg = 85; 
  const l_text = 30;
  const background = `hsla(${h}, ${s}%, ${l_bg}%, 0.95)`;
  const border = `hsl(${h}, ${s}%, ${l_text}%)`; // Text color
  const shadowColor = `hsla(${h}, ${s}%, ${l_bg}%, 0.5)`;
  return { background, border, shadowColor };
};

const findMinPriceInfo = (prices: ProductPrices): MinPriceInfo => {
  if (Object.keys(prices).length === 0) {
      return { minPrice: Infinity, distributors: [] };
  }
  const minPrice = Math.min(...Object.values(prices));
  const distributors = Object.entries(prices)
    .filter(([, price]) => price === minPrice)
    .map(([distributor]) => distributor);
  return { minPrice, distributors };
};

const Header = () => (
  <header className="bg-[#22c55e] shadow-md sticky top-0 z-50">
    <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-16">
        <div className="flex items-center">
          <span className="font-logo text-white text-3xl">
            precin
          </span>
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
  if (isNaN(numericPrice)) {
    return '0.00';
  }
  const priceStr = numericPrice.toFixed(3);
  if (priceStr.endsWith('0')) {
    return numericPrice.toFixed(2);
  }
  return priceStr;
};

const formatCurrency = (value: number): string => {
  if (isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
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
    <div className="text-right hidden sm:block">
      <p className="font-semibold text-sm text-gray-700 tabular-nums">{formattedDateTime.replace(',', '')}</p>
      <p className="text-xs text-gray-500">Horário de Brasília</p>
    </div>
  );
};

const CustomerQuoteTable: React.FC<CustomerQuoteTableProps> = ({ 
  customerPrices, 
  customerPriceInputs,
  handlePriceChange, 
  marketMinPrices,
  averagePrices,
  comparisonMode,
  handleModeChange,
  selectedPosto,
  handlePostoChange,
  onOpenShareModal,
  isSharing,
  quoteTableRef,
  distributorColors,
  products,
  selectedQuoteDistributor,
  onQuoteDistributorChange,
  allDistributors,
  selectedDistributors,
  onDistributorPillClick,
  isSharePreview = false,
  isVolumeMode,
  onVolumeModeToggle,
  volumes,
  onVolumeChange,
}) => {
  const isAvgMode = comparisonMode === 'avg';

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const filteredDistributors = allDistributors.filter(d => 
    d.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columnStyles = isSharePreview
    ? {
        produto: { width: '15%' },
        precoCliente: { width: '15%' },
        precoMercado: { width: '15%' },
        diferencaRS: { width: '12%' },
        diferencaPct: { width: '12%' },
        distribuidora: { width: '31%' },
      }
    : {};

  return (
    <div ref={quoteTableRef} className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <div className={
          isSharePreview 
            ? "px-6 pt-6 pb-4" 
            : "p-4 sm:p-6 flex justify-between items-center border-b border-gray-200 flex-wrap gap-4"
        }>
        <div className="flex items-center gap-4 flex-wrap">
            <h2 className={isSharePreview 
                ? "text-2xl font-black text-gray-800 tracking-wider"
                : "text-xl sm:text-2xl font-bold text-gray-800 tracking-wide"
            }>COTAÇÃO POSTO</h2>
            {isSharePreview ? (
              <span className="text-2xl font-black text-gray-800 tracking-wider">{selectedPosto}</span>
            ) : (
              <div className="relative">
                <select
                  className="appearance-none pl-4 pr-10 py-2.5 bg-white text-green-800 font-semibold rounded-lg shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 transition-all text-sm"
                  title="Selecionar Posto"
                  value={selectedPosto}
                  onChange={handlePostoChange}
                >
                  {Object.keys(POSTO_PRICES).map(posto => (
                    <option key={posto} value={posto} className="text-gray-800">{posto}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-green-800">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            )}
            {!isSharePreview && (
              <div className="flex items-center gap-2">
                  <div className="relative" onClick={onVolumeModeToggle}>
                      <input id="volume-toggle" type="checkbox" className="sr-only peer" checked={isVolumeMode} readOnly />
                      <div className="w-12 h-6 bg-gray-200 rounded-full peer-checked:bg-green-100 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-full peer-checked:bg-green-600"></div>
                  </div>
                  <label htmlFor="volume-toggle" className="flex items-center cursor-pointer select-none">
                      <span className="text-sm font-semibold text-gray-700">Calcular Volume</span>
                  </label>
              </div>
            )}
        </div>
        {!isSharePreview && (
          <div className="flex items-center gap-3 flex-wrap">
              <RealTimeClock />
              <div className="relative">
                <select
                  className="appearance-none pl-4 pr-10 py-2.5 bg-white text-green-800 font-semibold rounded-lg shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 transition-all text-sm"
                  title="Analisar dados"
                  value={comparisonMode}
                  onChange={handleModeChange}
                >
                  <option value="min">Mínima</option>
                  <option value="avg">Média</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-green-800">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
              <button
                onClick={onOpenShareModal}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-green-800 font-semibold rounded-lg shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 transition-all disabled:opacity-50 disabled:cursor-wait text-sm"
                aria-label="Compartilhar"
                title="Compartilhar"
                disabled={isSharing}
              >
                {isSharing ? (
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="8.59" y1="10.49" x2="15.42" y2="6.51"></line>
                  </svg>
                )}
                <span>{isSharing ? 'Enviando...' : 'Compartilhar'}</span>
              </button>
          </div>
        )}
      </div>
      <div className={isSharePreview ? '' : 'overflow-x-auto'}>
        <table className={`w-full text-sm text-left text-gray-700 ${isSharePreview ? 'table-fixed' : ''}`}>
          <thead className={`text-xs text-white uppercase ${isSharePreview ? 'bg-green-600' : 'bg-gradient-to-r from-green-600 to-green-500'}`}>
            <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-bold [&>th]:tracking-wider">
              <th scope="col" className={isSharePreview 
                    ? "text-left bg-green-600" 
                    : "text-left sticky left-0 z-20 bg-green-600 min-w-[140px]"
                } style={columnStyles.produto}>PRODUTO</th>
              {isVolumeMode && !isSharePreview && (
                <th scope="col" className="text-center min-w-[130px]">VOLUME (mil L)</th>
              )}
              <th scope="col" className="text-center min-w-[180px]" style={columnStyles.precoCliente}>
                {isVolumeMode
                    ? `TOTAL ${(selectedQuoteDistributor || 'CLIENTE').toUpperCase()} (R$)`
                    : isSharePreview
                        ? (
                            <div className="flex items-center justify-center h-full">
                                {selectedQuoteDistributor ? (
                                    <span
                                        className="w-28 truncate text-center px-3 py-1 text-xs font-bold rounded-full ring-2 ring-white ring-offset-2 ring-offset-green-600 distributor-pill"
                                        style={{
                                            backgroundColor: (distributorColors[selectedQuoteDistributor] || distributorColors.DEFAULT).background,
                                            color: (distributorColors[selectedQuoteDistributor] || distributorColors.DEFAULT).border,
                                        } as React.CSSProperties}
                                    >
                                        {selectedQuoteDistributor}
                                    </span>
                                ) : selectedQuoteDistributor === '' ? (
                                    <span className="bg-white text-gray-700 px-4 py-1 text-xs font-bold rounded-full shadow-md inline-flex items-center">
                                        Indefinida (R$/L)
                                    </span>
                                ) : (
                                    <span className="font-bold text-white">CLIENTE (R$/L)</span>
                                )}
                            </div>
                          )
                        : (
                            <div className="relative inline-flex items-center justify-center" ref={selectorRef}>
                                <button
                                    type="button"
                                    className="inline-flex items-center justify-center gap-2"
                                    onClick={() => !isSharePreview && setIsSelectorOpen(!isSelectorOpen)}
                                    disabled={isSharePreview}
                                >
                                    {selectedQuoteDistributor && selectedQuoteDistributor !== '' ? (
                                        <>
                                            <span
                                                className="w-28 inline-block truncate text-center px-3 py-1.5 text-xs font-bold rounded-full ring-2 ring-white ring-offset-2 ring-offset-green-600 distributor-pill"
                                                style={{ 
                                                    backgroundColor: (distributorColors[selectedQuoteDistributor] || distributorColors.DEFAULT).background, 
                                                    color: (distributorColors[selectedQuoteDistributor] || distributorColors.DEFAULT).border,
                                                    '--shadow-color': (distributorColors[selectedQuoteDistributor] || distributorColors.DEFAULT).shadowColor,
                                                } as React.CSSProperties}
                                            >
                                                {selectedQuoteDistributor}
                                            </span>
                                            <span className="text-white font-bold">(R$/L)</span>
                                            {!isSharePreview && (
                                                <svg className={`h-5 w-5 text-white transition-transform ${isSelectorOpen ? 'transform rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4 4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </>
                                    ) : (
                                        <span className="bg-white text-gray-700 px-4 py-2 text-sm font-bold rounded-full shadow-md inline-flex items-center gap-2">
                                            {selectedQuoteDistributor === '' ? 'Indefinida' : 'Distribuidora'}
                                            {!isSharePreview && (
                                                <svg className={`h-5 w-5 text-gray-700 transition-transform ${isSelectorOpen ? 'transform rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4 4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </span>
                                    )}
                                </button>
                                {isSelectorOpen && !isSharePreview && (
                                    <div className="origin-top-center absolute mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-30 top-full" style={{left: '50%', transform: 'translateX(-50%)'}}>
                                        <div className="p-2">
                                            <input
                                                type="text"
                                                placeholder="Pesquisar..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full px-3 py-2 border border-green-300 bg-green-50 placeholder-green-600 text-gray-800 rounded-md focus:bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors text-sm"
                                                autoFocus
                                            />
                                        </div>
                                        <ul className="py-1 max-h-60 overflow-auto" role="menu" aria-orientation="vertical">
                                            <li>
                                                <button
                                                    onClick={() => {
                                                        onQuoteDistributorChange('');
                                                        setIsSelectorOpen(false);
                                                        setSearchTerm('');
                                                    }}
                                                    className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                                    role="menuitem"
                                                >
                                                    <span 
                                                        className="w-3 h-3 rounded-full shrink-0 bg-gray-300 ring-2 ring-gray-200"
                                                    ></span>
                                                    <span className="truncate">Indefinida</span>
                                                </button>
                                            </li>
                                            <div className="border-t border-gray-200 my-1"></div>

                                            {filteredDistributors.length > 0 ? filteredDistributors.map(distributor => (
                                                <li key={distributor}>
                                                    <button
                                                        onClick={() => {
                                                            onQuoteDistributorChange(distributor);
                                                            setIsSelectorOpen(false);
                                                            setSearchTerm('');
                                                        }}
                                                        className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                                        role="menuitem"
                                                    >
                                                        <span 
                                                            className="w-3 h-3 rounded-full shrink-0" 
                                                            style={{ backgroundColor: (distributorColors[distributor] || distributorColors.DEFAULT)?.background }}
                                                        ></span>
                                                        <span className="truncate">{distributor}</span>
                                                    </button>
                                                </li>
                                            )) : (
                                                <li className="px-4 py-2 text-sm text-gray-500">Nenhuma distribuidora encontrada.</li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )
                }
              </th>
              <th scope="col" className="text-center min-w-[150px] whitespace-nowrap" style={columnStyles.precoMercado}>
                {isVolumeMode ? 'TOTAL MERCADO (R$)' : (isAvgMode ? 'PREÇO MÉDIO (R$/L)' : 'MENOR PREÇO (R$/L)')}
              </th>
              <th scope="col" className="text-center min-w-[130px] whitespace-nowrap" style={columnStyles.diferencaRS}>
                {isVolumeMode ? 'DIFERENÇA TOTAL (R$)' : 'DIFERENÇA R$/L'}
              </th>
              {!isVolumeMode && (
                <th scope="col" className="text-center min-w-[130px] whitespace-nowrap" style={columnStyles.diferencaPct}>DIFERENÇA %</th>
              )}
              <th scope="col" className="text-center min-w-[220px]" style={columnStyles.distribuidora}>
                {isAvgMode ? 'DISTRIBUIDORAS (MÉDIA)' : 'DISTRIBUIDORAS (MINIMA)'}
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((produto, index) => {
              const customerPrice = customerPrices[produto] || 0;
              const comparisonPrice = isAvgMode ? (averagePrices[produto] || 0) : (marketMinPrices[produto]?.minPrice || 0);
              const { distributors } = marketMinPrices[produto] || { distributors: [] };
              const difference = customerPrice - comparisonPrice;
              const percentageDifference = comparisonPrice === 0 ? 0 : (difference / comparisonPrice) * 100;
              const isCheaper = difference <= 0;
              const numericVolume = parseFloat(volumes[produto] || '0');

              let highlightClasses = "bg-gray-50 border-gray-300 text-gray-900";
              const priceEntered = customerPriceInputs[produto] && customerPrice > 0;

              if (priceEntered && comparisonPrice > 0) {
                  if (difference <= 0.001) { // A small tolerance for floating point issues
                      highlightClasses = "bg-green-200 border-green-500 text-green-900";
                  } else {
                      highlightClasses = "bg-red-100 border-red-500 text-red-900";
                  }
              }
              
              if (!isSharePreview && !isVolumeMode) {
                  highlightClasses += " focus:border-transparent focus:ring-2 hover:ring-2 focus:shadow-lg hover:shadow-lg transition-all duration-200 ease-in-out";
                  if (priceEntered && comparisonPrice > 0) {
                      if (difference <= 0.001) {
                          highlightClasses += " focus:ring-green-500 hover:ring-green-500 focus:shadow-green-500/40 hover:shadow-green-500/40";
                      } else {
                          highlightClasses += " focus:ring-red-500 hover:ring-red-500 focus:shadow-red-500/40 hover:shadow-red-500/40";
                      }
                  } else {
                      highlightClasses += " focus:ring-gray-400 hover:ring-gray-400 focus:shadow-gray-400/30 hover:shadow-gray-400/30";
                  }
              }

              const marketPricePillClass = 'border-slate-400 text-gray-800';

              const isLastRow = index === products.length - 1;
              const cellBorderClass = isSharePreview && !isLastRow ? 'border-b border-gray-200' : '';

              return (
                <tr key={produto} className={`align-middle transition-colors hover:bg-gray-50/50 ${isSharePreview ? '' : 'border-b border-gray-200 last:border-b-0'}`}>
                  <td className={`px-4 py-4 font-semibold text-gray-800 whitespace-nowrap ${isSharePreview
                            ? "bg-white " + cellBorderClass
                            : "sticky left-0 z-10 bg-white hover:bg-gray-50/50 transition-colors"
                        }`}>{produto}</td>
                  {isVolumeMode && !isSharePreview && (
                      <td className={`px-4 py-4 text-center ${cellBorderClass}`}>
                          <input
                              type="text"
                              value={volumes[produto] ?? ''}
                              onChange={(e) => onVolumeChange(produto, e.target.value)}
                              placeholder="0"
                              className="w-28 rounded-full p-2 border font-bold text-center bg-gray-50 border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400 shadow-sm transition-all duration-200 ease-in-out hover:ring-2 hover:ring-green-400 hover:shadow-md"
                              aria-label={`Volume para ${produto} em milhares de litros`}
                          />
                      </td>
                  )}
                  <td className={`px-4 py-4 text-center ${cellBorderClass}`}>
                    {isVolumeMode || isSharePreview ? (
                        <span className={`inline-flex items-center justify-center w-36 h-10 rounded-full border font-bold ${highlightClasses}`}>
                            {isVolumeMode && !isSharePreview
                                ? formatCurrency(customerPrice * numericVolume * 1000)
                                : formatPriceWithConditionalDigits(customerPrice)
                            }
                        </span>
                    ) : (
                        <div className="relative flex justify-center items-center">
                            <input
                              type="number"
                              value={customerPriceInputs[produto] ?? ''}
                              onChange={(e) => handlePriceChange(produto, e.target.value)}
                              className={`w-36 rounded-full p-2 border font-bold text-center relative ${highlightClasses}`}
                              step="0.001"
                              readOnly={isSharePreview}
                            />
                        </div>
                    )}
                  </td>
                  <td className={`px-4 py-4 text-center ${cellBorderClass}`}>
                    <span className={`inline-flex items-center justify-center w-36 h-10 rounded-full bg-slate-100 font-bold border ${marketPricePillClass}`}>
                      {isVolumeMode && !isSharePreview
                          ? formatCurrency(comparisonPrice * numericVolume * 1000)
                          : formatPriceWithConditionalDigits(comparisonPrice)
                      }
                    </span>
                  </td>
                  <td className={`px-4 py-4 text-center ${cellBorderClass}`}>
                    <span className={`inline-flex items-center justify-center min-w-[80px] h-8 px-3 text-sm font-bold rounded-full ${isCheaper ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {isVolumeMode && !isSharePreview
                            ? `${(difference * numericVolume * 1000) > 0 ? '+' : ''}${formatCurrency(difference * numericVolume * 1000)}`
                            : `${difference > 0 ? '+' : ''}${formatPriceWithConditionalDigits(difference)}`
                        }
                    </span>
                  </td>
                  {!isVolumeMode && (
                    <td className={`px-4 py-4 text-center ${cellBorderClass}`}>
                      <span className={`inline-flex items-center justify-center min-w-[80px] h-8 px-3 text-sm font-bold rounded-full ${isCheaper ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {percentageDifference >= 0 ? '+' : ''}{percentageDifference.toFixed(2)}%
                      </span>
                    </td>
                  )}
                  
                  {isAvgMode ? (
                    index === 0 ? (
                      <td className="px-4 py-4 align-middle text-center" rowSpan={products.length}>
                          <div className={`grid grid-cols-2 gap-1.5 max-w-[240px] mx-auto ${isSharePreview ? 'p-2' : ''}`}>
                            {Array.from(selectedDistributors).sort().map((distributor: string) => {
                              const distributorStyle = distributorColors[distributor] || distributorColors.DEFAULT;
                              return (
                                <span
                                  key={distributor}
                                  onClick={!isSharePreview ? () => onDistributorPillClick?.(distributor) : undefined}
                                  className={`flex items-center justify-center px-3 h-8 text-xs font-bold rounded-full truncate distributor-pill ${!isSharePreview ? 'cursor-pointer' : ''}`}
                                  style={{ 
                                      backgroundColor: distributorStyle.background, 
                                      color: distributorStyle.border,
                                      '--shadow-color': distributorStyle.shadowColor,
                                  } as React.CSSProperties}
                                >
                                  {distributor}
                                </span>
                              );
                            })}
                          </div>
                      </td>
                    ) : null
                  ) : (
                    <td className={`px-4 py-4 text-center ${cellBorderClass}`}>
                        <div className="flex flex-wrap items-center justify-center gap-1 max-w-[200px] mx-auto">
                          {distributors.map((distributor) => {
                            const distributorStyle = distributorColors[distributor] || distributorColors.DEFAULT;
                            return (
                              <span
                                key={distributor}
                                onClick={!isSharePreview ? () => onDistributorPillClick?.(distributor) : undefined}
                                className={`inline-flex items-center justify-center px-3 h-8 text-xs font-bold rounded-full truncate distributor-pill ${!isSharePreview ? 'cursor-pointer' : ''}`}
                                style={{ 
                                    backgroundColor: distributorStyle.background, 
                                    color: distributorStyle.border,
                                    '--shadow-color': distributorStyle.shadowColor,
                                } as React.CSSProperties}
                              >
                                {distributor}
                              </span>
                            );
                          })}
                        </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const MarketDataTable: React.FC<MarketDataTableProps> = ({ marketData, marketMinPrices, distributors, distributorColors, selectedDistributors, highlightedDistributor }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <div className="p-4 sm:p-6 border-b border-gray-200">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-wide">COTAÇÃO COMPLETA DE MERCADO (BASE DE DADOS)</h2>
        <p className="text-xs text-gray-500 mt-1">
          A célula destacada em cada linha representa o menor preço de mercado entre as distribuidoras selecionadas.
        </p>
      </div>
      <div className="px-14 py-2">
        <table className="w-full text-sm text-left text-gray-700">
          <thead className="text-xs uppercase">
            <tr>
              <th scope="col" className="px-2 py-2 sticky left-0 bg-[#22c55e] z-20 font-semibold tracking-wider text-white">PRODUTO</th>
              {distributors.map((distributor) => {
                  const colors = distributorColors[distributor] || distributorColors.DEFAULT;
                  const isDistributorActive = selectedDistributors.has(distributor);
                  return (
                    <th 
                      key={distributor} 
                      scope="col" 
                      className={`px-2 py-2 text-center font-semibold tracking-wider transition-opacity ${!isDistributorActive ? 'opacity-40' : ''} ${highlightedDistributor === distributor ? 'highlight-column' : ''}`}
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
            {marketData.map(({ produto, prices }) => (
              <tr key={produto}>
                <th scope="row" className="px-2 py-3 font-medium text-gray-900 bg-white whitespace-nowrap sticky left-0 z-10 border-r">{produto}</th>
                {distributors.map((distributor, index) => {
                  const price = prices[distributor];
                  const isDistributorActive = selectedDistributors.has(distributor);
                  const isMinPriceAmongSelected = price === marketMinPrices[produto]?.minPrice;
                  const isMin = isDistributorActive && isMinPriceAmongSelected;

                  const columnClass = index % 2 !== 0 ? 'bg-slate-50' : 'bg-white';
                  
                  return (
                    <td key={distributor} className={`px-2 py-3 text-center font-bold transition-all duration-200 hover:scale-[1.2] hover:shadow-lg hover:relative hover:z-20 hover:rounded-lg ${
                        isMin 
                        ? 'bg-green-200 text-green-950 z-10 relative hover:shadow-green-400/60 overflow-hidden' 
                        : `${columnClass} text-gray-800 ${!isDistributorActive ? 'opacity-40' : ''}`
                    } ${highlightedDistributor === distributor ? 'highlight-column' : ''}`}>
                      {price?.toFixed(2) ?? '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
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
  // distributorColors is available in props but unused to reduce visual noise
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
    
    // Treat dates as UTC to align with the user's expectation of the "day" of the data.
    const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
    });

    for (let i = 1; i < chart.data.labels.length; i++) {
      const label = chart.data.labels[i] as string;
      // By taking only the date part and specifying it as UTC, we ignore the time component
      // which was causing the date to shift back by a day in the Brasília timezone.
      const currentDate = new Date(`${label.substring(0, 10)}T12:00:00Z`);
      const currentDayString = dayOfWeekFormatter.format(currentDate);
      
      // Draw line before each Monday (in UTC)
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
              // By taking only the date part of the timestamp (YYYY-MM-DD),
              // we ensure the date displayed on the chart matches the UTC date of the data record.
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
              // By taking only the date part of the timestamp (YYYY-MM-DD),
              // we ensure the date displayed on the chart matches the UTC date of the data record,
              // avoiding timezone conversions that could shift it to the previous day.
              const date = new Date(`${label.substring(0, 10)}T12:00:00Z`);
              return date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'UTC' // Format the date part without timezone conversion.
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
      
      // Calculate min and max that are multiples of stepSize and provide padding
      const paddedMin = (Math.floor(dataMin / stepSize) * stepSize) - stepSize;
      const paddedMax = (Math.ceil(dataMax / stepSize) * stepSize) + stepSize;

      options.scales.y.min = Math.max(0, paddedMin); // Ensure min is not negative
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
  const dragThreshold = useRef(5); // A small threshold to distinguish a click from a drag
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
    if (slideElement) {
        pointerDownSlideIndex.current = parseInt(slideElement.getAttribute('data-slide-index') || '-1', 10);
    } else {
        pointerDownSlideIndex.current = null;
    }

    isDragging.current = true;
    dragStartX.current = e.clientX;
    setDragOffset(0); // Reset offset on new drag
    setIsTransitioning(false); // Disable transitions for instant drag feedback
    if (carouselRef.current) {
      carouselRef.current.style.cursor = 'grabbing';
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const currentX = e.clientX;
    const delta = currentX - dragStartX.current;
    setDragOffset(delta);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    
    setIsTransitioning(true); // Re-enable transitions for the snap animation

    if (carouselRef.current) {
      carouselRef.current.style.cursor = 'grab';
    }
    
    // Logic to differentiate click from drag
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
        // It's a drag. Determine which way to swipe.
        const swipeThreshold = 50; 
        if (dragOffset > swipeThreshold) {
            goToPrev();
        } else if (dragOffset < -swipeThreshold) {
            goToNext();
        }
    }
    
    setDragOffset(0); // Reset drag offset
    pointerDownSlideIndex.current = null;
  };
  
  useEffect(() => {
    const carouselElement = carouselRef.current;
    const preventContextMenu = (e: Event) => e.preventDefault();
    if (carouselElement) {
      carouselElement.addEventListener('contextmenu', preventContextMenu);
      return () => {
        carouselElement.removeEventListener('contextmenu', preventContextMenu);
      };
    }
  }, []);

  return (
    <div className="relative w-full h-[350px] flex items-center justify-center">
      {/* Left Navigation Button */}
      <button 
        onClick={goToPrev} 
        className="absolute left-0 sm:-left-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-white/60 backdrop-blur-sm shadow-lg hover:bg-white/90 transition-all disabled:opacity-50"
        aria-label="Gráfico Anterior"
        disabled={products.length <= 1}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-800">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
      </button>

      {/* Carousel Viewport */}
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

          // Looping logic for continuous carousel
          if (numProducts > 2) { 
            if (offset > numProducts / 2) {
              offset -= numProducts;
            }
            if (offset < -numProducts / 2) {
              offset += numProducts;
            }
          }

          const dragProgress = isTransitioning ? 0 : dragOffset / carouselWidth;
          const effectiveOffset = offset - dragProgress;
          const absEffectiveOffset = Math.abs(effectiveOffset);

          // Hide slides that are too far away for performance
          if (absEffectiveOffset > 2) {
            return <div key={fuelType} style={{ display: 'none' }} />;
          }

          // Interpolate properties based on the effective position for a fluid 3D effect
          const scale = 1 - 0.2 * Math.min(absEffectiveOffset, 2);
          const translateZ = -150 * Math.min(absEffectiveOffset, 2);
          const rotateY = -40 * effectiveOffset;
          const opacity = Math.max(0, 1 - 0.5 * absEffectiveOffset);
          const translateX = effectiveOffset * 65; // Percentage for horizontal position

          const isCenter = offset === 0;

          const style: React.CSSProperties = {
            transform: `translateX(${translateX}%) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
            opacity: opacity,
            zIndex: products.length - Math.round(absEffectiveOffset),
            transition: isTransitioning ? 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease' : 'none',
            position: 'absolute',
            width: '60%',
            height: '100%',
            top: 0,
            left: '20%',
            pointerEvents: !isDragging.current ? 'auto' : 'none', // Allow clicks on any slide when not dragging
          };

          return (
            <div key={fuelType} style={style} data-slide-index={index}>
              <PriceEvolutionChart
                title={fuelType}
                chartData={chartData[fuelType]}
                isCarouselItem={true}
                isCenter={isCenter}
              />
            </div>
          );
        })}
      </div>

      {/* Right Navigation Button */}
      <button 
        onClick={goToNext} 
        className="absolute right-0 sm:-right-4 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-white/60 backdrop-blur-sm shadow-lg hover:bg-white/90 transition-all disabled:opacity-50"
        aria-label="Próximo Gráfico"
        disabled={products.length <= 1}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-800">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>

    </div>
  );
};


const PostoSelectionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (selected: PostoName[]) => void;
    postos: PostoName[];
    postoDistributorSelections: Partial<Record<PostoName, string>>;
    distributorColors: DistributorColors;
}> = ({ isOpen, onClose, onGenerate, postos, postoDistributorSelections, distributorColors }) => {
    const [selected, setSelected] = useState<Set<PostoName>>(new Set());

    const handleToggle = (posto: PostoName) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(posto)) {
                newSet.delete(posto);
            } else {
                newSet.add(posto);
            }
            return newSet;
        });
    };

    const handleGenerateClick = () => {
        if (selected.size > 0) {
            onGenerate([...selected]);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Selecionar Postos para Compartilhar</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>

                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                    {postos.map(posto => {
                      const distributor = postoDistributorSelections[posto];
                      const distributorStyle = distributor ? distributorColors[distributor] : null;
                      return (
                        <label key={posto} htmlFor={`posto-select-${posto}`} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors border border-gray-200 has-[:checked]:bg-green-50 has-[:checked]:border-green-400">
                           <div className="flex items-center">
                               <input
                                    id={`posto-select-${posto}`}
                                    type="checkbox"
                                    checked={selected.has(posto)}
                                    onChange={() => handleToggle(posto)}
                                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-800">{posto}</span>
                           </div>
                           {distributor && distributorStyle && (
                                <span
                                    className="px-2 py-0.5 text-xs font-bold rounded-full truncate distributor-pill"
                                    style={{
                                        backgroundColor: distributorStyle.background,
                                        color: distributorStyle.border,
                                        '--shadow-color': distributorStyle.shadowColor,
                                    } as React.CSSProperties}
                                >
                                    {distributor}
                                </span>
                           )}
                        </label>
                      )
                    })}
                </div>

                <footer className="p-4 border-t border-gray-200 flex justify-end items-center gap-3 bg-gray-50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50">Cancelar</button>
                    <button onClick={handleGenerateClick} disabled={selected.size === 0} className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg shadow-sm hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed">
                        Gerar Imagem
                    </button>
                </footer>
            </div>
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
    postosToShare: PostoName[];
    marketMinPrices: { [product: string]: MinPriceInfo };
    averagePrices: { [product: string]: number };
    comparisonMode: ComparisonMode;
    distributorColors: DistributorColors;
    products: string[];
    postoDistributorSelections: Partial<Record<PostoName, string>>;
    allDistributors: string[];
    selectedDistributors: Set<string>;
}> = ({ 
    isOpen, onClose, isSharing, executeShareAction, shareActions, postosToShare,
    marketMinPrices, averagePrices, comparisonMode, distributorColors, products, 
    postoDistributorSelections, allDistributors, selectedDistributors
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
                <h1 className="font-logo text-green-600 text-5xl">precin</h1>
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
                            {postosToShare.map(postoName => {
                                const prices = POSTO_PRICES[postoName];
                                const priceInputs = Object.fromEntries(
                                    Object.entries(prices).map(([k, v]) => [k, (v as number).toFixed(2)])
                                );
                                return (
                                    <CustomerQuoteTable
                                        key={postoName}
                                        selectedPosto={postoName}
                                        customerPrices={prices}
                                        customerPriceInputs={priceInputs}
                                        handlePriceChange={() => {}}
                                        handleModeChange={() => {}}
                                        handlePostoChange={() => {}}
                                        onQuoteDistributorChange={() => {}}
                                        onOpenShareModal={() => {}}
                                        isSharing={false}
                                        quoteTableRef={null}
                                        isSharePreview={true}
                                        marketMinPrices={marketMinPrices}
                                        averagePrices={averagePrices}
                                        comparisonMode={comparisonMode}
                                        distributorColors={distributorColors}
                                        products={products}
                                        selectedQuoteDistributor={postoDistributorSelections[postoName]}
                                        allDistributors={allDistributors}
                                        selectedDistributors={selectedDistributors}
                                        isVolumeMode={false}
                                        onVolumeModeToggle={() => {}}
                                        volumes={{}}
                                        onVolumeChange={() => {}}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    {/* Visible container for user preview */}
                    <div className="p-8 bg-white">
                        <ShareHeader />
                        <div className="space-y-8">
                            {postosToShare.map(postoName => {
                                const prices = POSTO_PRICES[postoName];
                                const priceInputs = Object.fromEntries(
                                    Object.entries(prices).map(([k, v]) => [k, (v as number).toFixed(2)])
                                );
                                return (
                                    <CustomerQuoteTable
                                        key={postoName}
                                        selectedPosto={postoName}
                                        customerPrices={prices}
                                        customerPriceInputs={priceInputs}
                                        handlePriceChange={() => {}}
                                        handleModeChange={() => {}}
                                        handlePostoChange={() => {}}
                                        onQuoteDistributorChange={() => {}}
                                        onOpenShareModal={() => {}}
                                        isSharing={false}
                                        quoteTableRef={null}
                                        isSharePreview={true}
                                        marketMinPrices={marketMinPrices}
                                        averagePrices={averagePrices}
                                        comparisonMode={comparisonMode}
                                        distributorColors={distributorColors}
                                        products={products}
                                        selectedQuoteDistributor={postoDistributorSelections[postoName]}
                                        allDistributors={allDistributors}
                                        selectedDistributors={selectedDistributors}
                                        isVolumeMode={false}
                                        onVolumeModeToggle={() => {}}
                                        volumes={{}}
                                        onVolumeChange={() => {}}
                                    />
                                );
                            })}
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
        rank++; // Dense rank
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
                if (rank === 1) rankColor = 'bg-yellow-400 text-yellow-900'; // Gold
                if (rank === 2) rankColor = 'bg-gray-300 text-gray-800'; // Silver
                if (rank === 3) rankColor = 'bg-orange-400 text-orange-900'; // Bronze

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


export default function App() {
  const POSTO_NAMES = Object.keys(POSTO_PRICES) as PostoName[];
  const [selectedPosto, setSelectedPosto] = useState<PostoName>(POSTO_NAMES[0]);
  const [customerPrices, setCustomerPrices] = useState<CustomerPrices>(POSTO_PRICES[POSTO_NAMES[0]]);
  const [customerPriceInputs, setCustomerPriceInputs] = useState<Record<string, string>>(() => {
    const initialPrices = POSTO_PRICES[POSTO_NAMES[0]];
    return Object.fromEntries(
      Object.entries(initialPrices).map(([key, value]) => [key, value.toFixed(2)])
    );
  });
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('min');
  const [postoDistributorSelections, setPostoDistributorSelections] = useState<Partial<Record<PostoName, string>>>({});
  
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPostoSelectionModalOpen, setIsPostoSelectionModalOpen] = useState(false);
  const [postosToShare, setPostosToShare] = useState<PostoName[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const quoteTableRef = useRef<HTMLDivElement>(null);
  const marketTableRef = useRef<HTMLDivElement>(null);
  
  const [marketData, setMarketData] = useState<ProductData[]>([]);
  const [distributors, setDistributors] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [distributorColors, setDistributorColors] = useState<DistributorColors>({
      DEFAULT: { 
          background: 'rgba(75, 85, 99, 0.95)', 
          border: '#ffffff', 
          shadowColor: 'rgba(75, 85, 99, 0.5)' 
      }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDistributors, setSelectedDistributors] = useState<Set<string>>(new Set());
  const [priceEvolutionData, setPriceEvolutionData] = useState<{ [key: string]: DailyPriceSummary[] }>({});
  const [rankingProduct, setRankingProduct] = useState<string | null>(null);
  const [highlightedDistributor, setHighlightedDistributor] = useState<string | null>(null);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const [isVolumeMode, setIsVolumeMode] = useState(false);
  const [volumes, setVolumes] = useState<{ [product: string]: string }>({});
  
  const allPossibleDistributors = useMemo(() => Object.keys(DISTRIBUTOR_BRAND_COLORS).sort(), []);

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

      const pricesPromise = supabaseClient
        .from('todays_fuel_prices')
        .select('fuel_type, distribuidora:Distribuidora, price')
        .eq('Base', 'Betim - MG');

      const evolutionPromise = supabaseClient
        .from('resumo_diario_mes_atual')
        .select('created_at, dia, fuel_type, preco_minimo:min_price, preco_medio:avg_price, preco_maximo:max_price')
        .eq('Base', 'Betim - MG')
        .order('created_at', { ascending: true });

      const [pricesResult, evolutionResult] = await Promise.all([pricesPromise, evolutionPromise]);

      if (pricesResult.error || evolutionResult.error) {
        const errorMessages = [];
        if (pricesResult.error) {
          console.error('Error fetching prices data from Supabase:', pricesResult.error);
          errorMessages.push(`preços diários (${pricesResult.error.message})`);
        }
        if (evolutionResult.error) {
          console.error('Error fetching evolution data from Supabase:', evolutionResult.error);
          errorMessages.push(`histórico de preços (${evolutionResult.error.message})`);
        }
        setError(`Ocorreu um erro ao buscar os dados: ${errorMessages.join('; ')}.`);
      } else {
        const rawData: FuelPriceRecord[] = pricesResult.data;
        const productMap = new Map<string, ProductPrices>();
        const distributorSet = new Set<string>();
        const productSet = new Set<string>();

        rawData.forEach(record => {
            const distributorName = (record as any).distribuidora; // Use aliased column
            if (!record.fuel_type || !distributorName || record.price === null) return;
            if (!productMap.has(record.fuel_type)) {
                productMap.set(record.fuel_type, {});
            }
            productMap.get(record.fuel_type)![distributorName] = record.price;
            distributorSet.add(distributorName);
            productSet.add(record.fuel_type);
        });

        const newMarketData: ProductData[] = Array.from(productMap.entries()).map(([produto, prices]) => ({
            produto,
            prices
        }));

        const productOrder = ['Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel S10', 'Diesel S500'];
        const customSort = (a: string, b: string) => {
          const indexA = productOrder.indexOf(a);
          const indexB = productOrder.indexOf(b);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return a.localeCompare(b);
        };

        const newDistributors = Array.from(distributorSet).sort();
        const newProducts = Array.from(productSet).sort(customSort);
        const sortedMarketData = newMarketData.sort((a, b) => customSort(a.produto, b.produto));

        const brandColorKeys = Object.keys(DISTRIBUTOR_BRAND_COLORS);
        const fetchedColors = allPossibleDistributors.reduce((acc: DistributorColors, name: string) => {
          const brandKey = brandColorKeys.find(key => key.toLowerCase() === name.toLowerCase());
          let style: Partial<DistributorStyle>;
          if (brandKey && DISTRIBUTOR_BRAND_COLORS[brandKey]) {
            style = { ...DISTRIBUTOR_BRAND_COLORS[brandKey] };
          } else {
            style = generateColorFromString(name);
          }
          
          let baseColor = style.background || 'rgba(100, 116, 139, 0.95)';
          style.background = baseColor.replace(/, ?\d?\.?\d+\)$/, ', 0.95)');
          
          if (!style.shadowColor) {
            style.shadowColor = style.background.replace(/, ?0.95\)$/, ', 0.5)');
          }

          acc[name] = style as DistributorStyle;
          return acc;
        }, { 
            DEFAULT: { 
                background: 'rgba(75, 85, 99, 0.95)', 
                border: '#ffffff', 
                shadowColor: 'rgba(75, 85, 99, 0.5)' 
            } 
        });
        
        setMarketData(sortedMarketData);
        setDistributors(newDistributors);
        setProducts(newProducts);
        setDistributorColors(fetchedColors);
        setSelectedDistributors(new Set(newDistributors));

        const groupedByFuel = evolutionResult.data.reduce((acc: { [key: string]: DailyPriceSummary[] }, record: DailyPriceSummary) => {
            const { fuel_type } = record;
            if (!acc[fuel_type]) acc[fuel_type] = [];
            acc[fuel_type].push(record);
            return acc;
        }, {});
        setPriceEvolutionData(groupedByFuel);
      }
      setIsLoading(false);
    }
    fetchAllData();
  }, [allPossibleDistributors]);

  const marketMinPrices = useMemo(() => {
    return marketData.reduce((acc, { produto, prices }) => {
      const filteredPrices: ProductPrices = {};
      for (const distributor of selectedDistributors) {
          if (prices[distributor] !== undefined) {
              filteredPrices[distributor] = prices[distributor];
          }
      }
      acc[produto] = findMinPriceInfo(filteredPrices);
      return acc;
    }, {} as { [product: string]: MinPriceInfo });
  }, [marketData, selectedDistributors]);
  
  const dynamicAveragePrices = useMemo(() => {
    const newAveragePrices: { [product: string]: number } = {};
    marketData.forEach(({ produto, prices }) => {
      const priceList: number[] = [];
      for (const distributor of selectedDistributors) {
        if (prices[distributor] !== undefined && prices[distributor] !== null) {
          priceList.push(prices[distributor]);
        }
      }
      newAveragePrices[produto] = calculateIQRAverage(priceList);
    });
    return newAveragePrices;
  }, [marketData, selectedDistributors]);

  const formattedChartData = useMemo(() => {
    const chartDataSets: { [key: string]: any } = {};
    for (const fuelType in priceEvolutionData) {
        const data = priceEvolutionData[fuelType as keyof typeof priceEvolutionData];
        const labels = data.map(d => d.created_at); // Use full date for logic
        
        chartDataSets[fuelType] = {
            labels,
            datasets: [
                {
                    label: 'Preço Máximo',
                    data: data.map(d => d.preco_maximo),
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.2,
                    borderWidth: 2,
                },
                {
                    label: 'Preço Médio',
                    data: data.map(d => d.preco_medio),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.2,
                    borderWidth: 2,
                },
                {
                    label: 'Preço Mínimo',
                    data: data.map(d => d.preco_minimo),
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    tension: 0.2,
                    borderWidth: 2,
                },
            ]
        };
    }
    return chartDataSets;
  }, [priceEvolutionData]);


  const handlePriceChange = useCallback((product: string, value: string) => {
    setCustomerPriceInputs(prev => ({
      ...prev,
      [product]: value
    }));

    const parsedValue = parseFloat(value);
    if (!isNaN(parsedValue)) {
      setCustomerPrices(prev => ({
        ...prev,
        [product]: parsedValue
      }));
    } else if (value === '') {
      setCustomerPrices(prev => ({
        ...prev,
        [product]: 0
      }));
    }
  }, []);
  
  const handlePostoChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newPosto = event.target.value as PostoName;
    setSelectedPosto(newPosto);
    
    const newPricesNum = POSTO_PRICES[newPosto];
    setCustomerPrices(newPricesNum);
    
    const newPricesStr = Object.fromEntries(
      Object.entries(newPricesNum).map(([key, value]) => [key, value.toFixed(2)])
    );
    setCustomerPriceInputs(newPricesStr);
    setVolumes({});
  }, []);

  const handleModeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value as ComparisonMode;
    if (mode === 'min' || mode === 'avg') {
      setComparisonMode(mode);
    }
  }, []);
  
  const handleQuoteDistributorChange = useCallback((distributor: string) => {
    setPostoDistributorSelections(prev => ({
      ...prev,
      [selectedPosto]: distributor
    }));
  }, [selectedPosto]);

  const handleDistributorSelection = useCallback((distributor: string, isSelected: boolean) => {
    setSelectedDistributors(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(distributor);
      } else {
        newSet.delete(distributor);
      }
      return newSet;
    });
  }, []);

  const handleSelectAllDistributors = useCallback(() => {
    setSelectedDistributors(new Set(distributors));
  }, [distributors]);

  const handleClearAllDistributors = useCallback(() => {
    setSelectedDistributors(new Set());
  }, []);
  
  const handleVolumeModeToggle = useCallback(() => {
    setIsVolumeMode(prev => {
      const newMode = !prev;
      if (newMode) {
        // Set default volume of '0' for all products when turning on
        const defaultVolumes = Object.fromEntries(
            products.map(product => [product, '0'])
        );
        setVolumes(defaultVolumes);
      } else {
        // Clear volumes when turning off
        setVolumes({});
      }
      return newMode;
    });
  }, [products]);

  const handleVolumeChange = useCallback((product: string, value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
        setVolumes(prev => ({
            ...prev,
            [product]: value
        }));
    }
  }, []);

  const executeShareAction = async (action: (element: HTMLElement) => Promise<any>, elementToCapture: HTMLElement | null) => {
    if (!elementToCapture) {
      alert("Ocorreu um erro: elemento para captura não encontrado.");
      return;
    }
    setIsSharing(true);
    try {
      await action(elementToCapture);
    } catch (error: any) {
      console.error("Share/Download Error:", error);
      if (error.name !== 'AbortError') {
        alert("Ocorreu um erro ao tentar compartilhar. Por favor, tente novamente.");
      }
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
      if (!navigator.share) {
          alert("Seu navegador não suporta compartilhamento nativo. Tente baixar a imagem.");
          return;
      }
      const canvas = await html2canvas(element, { useCORS: true, scale: 2, windowWidth: element.scrollWidth, windowHeight: element.scrollHeight });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error("Não foi possível criar a imagem para compartilhar.");

      const file = new File([blob], 'cotacao.png', { type: 'image/png' });
      const shareData = {
          title: 'Cotação de Combustível',
          text: 'Confira a cotação de combustível do posto.',
          files: [file],
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData);
      } else {
          throw new Error("Não foi possível compartilhar este conteúdo.");
      }
  };

  const handleGenerateShare = (selectedPostos: PostoName[]) => {
      setPostosToShare(selectedPostos);
      setIsPostoSelectionModalOpen(false);
      setIsShareModalOpen(true);
  };
  
  const handleRankingProductSelect = (product: string) => {
    setRankingProduct(prev => (prev === product ? null : product));
  };
  
  const handleDistributorPillClick = useCallback((distributor: string) => {
    if (marketTableRef.current) {
        marketTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedDistributor(distributor);
        
        setTimeout(() => {
            setHighlightedDistributor(null);
        }, 2500); // Animation duration
    }
  }, []);
  
  const handleChartExpand = (fuelType: string) => {
    setExpandedChart(fuelType);
  };
  
  const handleChartClose = () => {
    setExpandedChart(null);
  };


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <div className="text-center">
          <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-green-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
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
      <RankingSidebar 
        products={products}
        onProductSelect={handleRankingProductSelect}
        activeProduct={rankingProduct}
      />
      <main className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
            <Hero />
            <CustomerQuoteTable 
                customerPrices={customerPrices} 
                customerPriceInputs={customerPriceInputs}
                handlePriceChange={handlePriceChange}
                marketMinPrices={marketMinPrices}
                averagePrices={dynamicAveragePrices}
                comparisonMode={comparisonMode}
                handleModeChange={handleModeChange}
                selectedPosto={selectedPosto}
                handlePostoChange={handlePostoChange}
                onOpenShareModal={() => setIsPostoSelectionModalOpen(true)}
                isSharing={isSharing}
                quoteTableRef={quoteTableRef}
                distributorColors={distributorColors}
                products={products}
                selectedQuoteDistributor={postoDistributorSelections[selectedPosto]}
                onQuoteDistributorChange={handleQuoteDistributorChange}
                allDistributors={allPossibleDistributors}
                selectedDistributors={selectedDistributors}
                onDistributorPillClick={handleDistributorPillClick}
                isVolumeMode={isVolumeMode}
                onVolumeModeToggle={handleVolumeModeToggle}
                volumes={volumes}
                onVolumeChange={handleVolumeChange}
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
      <PostoSelectionModal
        isOpen={isPostoSelectionModalOpen}
        onClose={() => setIsPostoSelectionModalOpen(false)}
        onGenerate={handleGenerateShare}
        postos={POSTO_NAMES}
        postoDistributorSelections={postoDistributorSelections}
        distributorColors={distributorColors}
      />
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        isSharing={isSharing}
        executeShareAction={executeShareAction}
        shareActions={{ handleDownloadJPG, handleDownloadPDF, handleWebShare }}
        postosToShare={postosToShare}
        marketMinPrices={marketMinPrices}
        averagePrices={dynamicAveragePrices}
        comparisonMode={comparisonMode}
        distributorColors={distributorColors}
        products={products}
        postoDistributorSelections={postoDistributorSelections}
        allDistributors={allPossibleDistributors}
        selectedDistributors={selectedDistributors}
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