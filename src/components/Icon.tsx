import { AudioLines, ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Command, Disc3, Folder, Headphones, Heart, LayoutGrid, List, LoaderCircle, Maximize2, Mic, MicOff, Minus, MoreHorizontal, Music2, Pause, Play, Plus, Radio, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Square, Volume2, Waves, X, Zap, Cable, Trash2 } from 'lucide-react';

const icons = { AudioLines, ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Command, Disc3, Folder, Headphones, Heart, LayoutGrid, List, LoaderCircle, Maximize2, Mic, MicOff, Minus, MoreHorizontal, Music2, Pause, Play, Plus, Radio, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Square, Volume2, Waves, X, Zap, Cable, Trash2 };
export type IconName = keyof typeof icons;
export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  const Component = icons[name];
  return <Component size={size} strokeWidth={1.7} className={className} aria-hidden="true" />;
}
