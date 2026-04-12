import { useState, useEffect } from "react";
import axios from "axios";
import { Coins, Sparkles, Check, Loader2, CreditCard, History, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Generate a simple user ID (in production, use proper auth)
const getUserId = () => {
  let userId = localStorage.getItem("nyxen_user_id");
  if (!userId) {
    userId = "user_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("nyxen_user_id", userId);
  }
  return userId;
};

export default function CreditsPage() {
  const [credits, setCredits] = useState(null);
  const [packages, setPackages] = useState([]);
  const [costs, setCosts] = useState({});
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(null);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);

  const userId = getUserId();

  useEffect(() => {
    fetchCredits();
    fetchPackages();
    fetchHistory();
    checkPaymentReturn();
  }, []);

  const fetchCredits = async () => {
    try {
      const response = await axios.get(`${API}/credits/${userId}`);
      setCredits(response.data.credits);
      setCosts(response.data.costs);
    } catch (error) {
      console.error("Error fetching credits:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPackages = async () => {
    try {
      const response = await axios.get(`${API}/credits/packages/list`);
      setPackages(response.data.packages);
    } catch (error) {
      console.error("Error fetching packages:", error);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${API}/credits/history/${userId}`);
      setHistory(response.data.transactions);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const checkPaymentReturn = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    const status = urlParams.get("status");

    if (sessionId && status === "success") {
      setIsCheckingPayment(true);
      await pollPaymentStatus(sessionId);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;
    
    if (attempts >= maxAttempts) {
      toast.error("Payment status check timed out. Credits will be added shortly.");
      setIsCheckingPayment(false);
      return;
    }

    try {
      const response = await axios.get(`${API}/credits/checkout/status/${sessionId}`);
      
      if (response.data.payment_status === "paid") {
        toast.success(`Payment successful! ${response.data.credits_added} credits added.`);
        setCredits(response.data.current_balance);
        fetchHistory();
        setIsCheckingPayment(false);
        return;
      } else if (response.data.status === "expired") {
        toast.error("Payment session expired.");
        setIsCheckingPayment(false);
        return;
      }

      // Continue polling
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (error) {
      console.error("Error checking payment:", error);
      setIsCheckingPayment(false);
    }
  };

  const purchaseCredits = async (packageId) => {
    try {
      setIsPurchasing(packageId);
      
      const response = await axios.post(`${API}/credits/purchase`, {
        package_id: packageId,
        origin_url: `${window.location.origin}/credits?user_id=${userId}`
      });

      // Redirect to Stripe checkout
      window.location.href = response.data.checkout_url;
      
    } catch (error) {
      console.error("Error purchasing:", error);
      toast.error("Failed to initiate purchase. Please try again.");
      setIsPurchasing(null);
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case "chat": return "💬";
      case "image": return "🖼️";
      case "story": return "📖";
      case "illustration": return "🎨";
      default: return action.startsWith("purchase") ? "💳" : "✨";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fdfcfb] py-8 px-4" data-testid="credits-page">
      {/* Payment Processing Overlay */}
      {isCheckingPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-80">
            <CardContent className="p-6 text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
              <h3 className="font-heading text-lg font-medium mb-2">Processing Payment</h3>
              <p className="text-sm text-muted-foreground">Please wait while we confirm your payment...</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-semibold text-foreground mb-2">Credits</h1>
          <p className="text-muted-foreground">Purchase credits to use Nyxen's AI features</p>
        </div>

        {/* Current Balance Card */}
        <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-80 mb-1">Your Balance</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{credits}</span>
                  <span className="text-lg opacity-80">credits</span>
                </div>
              </div>
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                <Coins className="w-8 h-8" />
              </div>
            </div>
            
            {credits !== null && credits < 10 && (
              <div className="mt-4 p-3 bg-white/10 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Low credits! Purchase more to continue using Nyxen.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credit Costs */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Credit Usage</CardTitle>
            <CardDescription>How credits are used for each action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(costs).map(([action, cost]) => (
                <div key={action} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                  <span className="capitalize text-sm">{action}</span>
                  <Badge variant="secondary">{cost} credit{cost > 1 ? 's' : ''}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Purchase Packages */}
        <div>
          <h2 className="font-heading text-xl font-semibold mb-4">Buy Credits</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {packages.map((pkg, index) => (
              <Card 
                key={pkg.id} 
                className={`relative overflow-hidden ${index === 1 ? 'border-primary shadow-lg' : ''}`}
                data-testid={`package-${pkg.id}`}
              >
                {index === 1 && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg">
                    Most Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="font-heading">{pkg.name}</CardTitle>
                  <CardDescription>{pkg.credits} credits</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <span className="text-3xl font-bold">${pkg.price.toFixed(2)}</span>
                    <span className="text-muted-foreground text-sm ml-1">USD</span>
                  </div>
                  <div className="text-sm text-muted-foreground mb-4">
                    ${(pkg.price / pkg.credits * 100).toFixed(1)}¢ per credit
                  </div>
                  <Button 
                    className="w-full" 
                    variant={index === 1 ? "default" : "outline"}
                    onClick={() => purchaseCredits(pkg.id)}
                    disabled={isPurchasing !== null}
                    data-testid={`buy-${pkg.id}`}
                  >
                    {isPurchasing === pkg.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    Buy Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <History className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No activity yet. Start chatting with Nyxen!</p>
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {history.map((tx, index) => (
                    <div 
                      key={tx.id || index} 
                      className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getActionIcon(tx.action)}</span>
                        <div>
                          <p className="text-sm font-medium capitalize">{tx.action.replace("_", " ")}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className={`font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
