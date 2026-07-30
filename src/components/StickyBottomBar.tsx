import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, UserCheck, ShoppingCart } from 'lucide-react';

interface StickyBottomBarProps {
  totalAmount: number;
  isUserIdValid: boolean;
  selectedPackageId: string | null;
  onCheckout: () => void;
  isSubmitting?: boolean;
}

const StickyBottomBar: React.FC<StickyBottomBarProps> = ({
  totalAmount,
  isUserIdValid,
  selectedPackageId,
  onCheckout,
  isSubmitting,
}) => {
  const isDisabled = !isUserIdValid || !selectedPackageId || isSubmitting;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 block md:hidden animate-slide-up">
      <div className="bg-white border-t border-pink-100 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] rounded-t-2xl px-4 pt-3 pb-5">
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Total</span>
            <div className="text-2xl font-extrabold text-pink-600 leading-tight">
              $ {totalAmount.toFixed(2)}
            </div>
          </div>
          <Button
            onClick={onCheckout}
            disabled={isDisabled}
            className={`rounded-full h-12 px-7 text-sm font-bold transition-all duration-200 ${
              isDisabled
                ? 'bg-pink-100 text-pink-300 cursor-not-allowed shadow-none'
                : 'bg-[#e91e63] hover:bg-[#d81b60] text-white shadow-lg shadow-pink-300/40 active:scale-95'
            }`}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : isUserIdValid && selectedPackageId ? (
              <>
                <ShoppingCart className="w-4 h-4 mr-1.5" />
                Pay Now
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4 mr-1.5" />
                Check ID & Select Package
              </>
            )}
          </Button>
        </div>
        <p className="text-[10px] text-center text-gray-400 leading-relaxed">
          Secured pipeline mechanism. Completion enforces terms validation logs.
        </p>
      </div>
    </div>
  );
};

export default StickyBottomBar;
