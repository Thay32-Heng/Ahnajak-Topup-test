import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface CartItem {
  id: string;
  packageId: string;
  gameId: string;
  gameName: string;
  gameIcon: string;
  packageName: string;
  amount: string;
  price: number;
  // Player verification data
  playerId: string;
  serverId?: string;
  playerName: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  // G2Bulk integration
  g2bulkProductId?: string;
  g2bulkTypeId?: string;
  // Voucher/Gift Card multi-buy
  quantity?: number;
  // Pre-order
  scheduledFulfillAt?: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  clearCart: () => void;
  getTotal: () => number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem("topup_cart");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("topup_cart", JSON.stringify(items));
  }, [items]);

  const addToCart = (item: CartItem) => {
    // Replace cart with single item - no quantity, just one item
    setItems([item]);
  };

  const clearCart = () => {
    setItems([]);
  };

  const getTotal = () => {
    return items.reduce((sum, item) => sum + item.price * (item.quantity && item.quantity > 1 ? item.quantity : 1), 0);
  };

  const itemCount = items.length;

  return (
    <CartContext.Provider
      value={{ items, addToCart, clearCart, getTotal, itemCount }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
};
