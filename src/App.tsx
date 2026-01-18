
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrivyProvider } from "@/components/PrivyProvider";
import { Layout } from "@/components/layout/Layout";
import Index from "./pages/Index";
import Explore from "./pages/Explore";
import CreateEvent from "./pages/CreateEvent";
import MyEvents from "./pages/MyEvents";
import MyTickets from "./pages/MyTickets";
import MyBundles from "./pages/MyBundles";
import Attestations from "./pages/Attestations";
import Drafts from "./pages/Drafts";
import Profile from "./pages/Profile";
import EventDetails from "./pages/EventDetails";
import EventDiscussions from "./pages/EventDiscussions";
import Admin from "./pages/Admin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminEvents from "./pages/AdminEvents";
import AdminGaslessConfig from "./pages/AdminGaslessConfig";
import AdminGasSponsorship from "./pages/AdminGasSponsorship";
import AdminNetworks from "./pages/AdminNetworks";
import AdminServiceAccount from "./pages/AdminServiceAccount";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminPayoutAccounts from "./pages/AdminPayoutAccounts";
import AdminRoute from "./components/routes/AdminRoute";
import VendorRoute from "./components/routes/VendorRoute";
import VendorPayoutAccount from "./pages/VendorPayoutAccount";
import BecomeVendor from "./pages/BecomeVendor";
import AdminVendorLock from "./pages/AdminVendorLock";
import VendorGamingBundles from "./pages/VendorGamingBundles";
import GamingBundlePOS from "./pages/GamingBundlePOS";
import GamingBundleRedemption from "./pages/GamingBundleRedemption";
import GamingBundleDetails from "./pages/GamingBundleDetails";
import GamingBundleClaim from "./pages/GamingBundleClaim";
import GamingBundles from "./pages/GamingBundles";
import VendorGamingBundleOrders from "./pages/VendorGamingBundleOrders";
import NotFound from "./pages/NotFound";

const App = () => {
  return (
    <HelmetProvider>
      <PrivyProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/gaming-bundles" element={<GamingBundles />} />
                <Route path="/create" element={<CreateEvent />} />
                <Route path="/events" element={<MyEvents />} />
                <Route path="/my-events" element={<MyEvents />} />
                <Route path="/my-tickets" element={<MyTickets />} />
                <Route path="/my-bundles" element={<MyBundles />} />
                <Route path="/attestations" element={<Attestations />} />
                <Route path="/drafts" element={<Drafts />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/networks" element={<AdminRoute><AdminNetworks /></AdminRoute>} />
                <Route path="/admin/schemas" element={<AdminRoute><Admin /></AdminRoute>} />
                <Route path="/admin/events" element={<AdminRoute><AdminEvents /></AdminRoute>} />
                <Route path="/admin/gasless" element={<AdminRoute><AdminGaslessConfig /></AdminRoute>} />
                <Route path="/admin/gas-sponsorship" element={<AdminRoute><AdminGasSponsorship /></AdminRoute>} />
                <Route path="/admin/service-account" element={<AdminRoute><AdminServiceAccount /></AdminRoute>} />
                <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
                <Route path="/admin/payout-accounts" element={<AdminRoute><AdminPayoutAccounts /></AdminRoute>} />
                <Route path="/admin/vendor-lock" element={<AdminRoute><AdminVendorLock /></AdminRoute>} />
                <Route path="/become-vendor" element={<BecomeVendor />} />
                <Route path="/vendor/payout-account" element={<VendorRoute><VendorPayoutAccount /></VendorRoute>} />
                <Route path="/vendor/gaming-bundles" element={<VendorRoute><VendorGamingBundles /></VendorRoute>} />
                <Route path="/vendor/bundles-pos" element={<VendorRoute><GamingBundlePOS /></VendorRoute>} />
                <Route path="/vendor/bundles-redeem" element={<VendorRoute><GamingBundleRedemption /></VendorRoute>} />
                <Route path="/vendor/bundles-orders" element={<VendorRoute><VendorGamingBundleOrders /></VendorRoute>} />
                <Route path="/gaming-bundles/claim" element={<GamingBundleClaim />} />
                <Route path="/gaming-bundles/:id" element={<GamingBundleDetails />} />
                <Route path="/event/:id" element={<EventDetails />} />
                <Route path="/event/:id/discussions" element={<EventDiscussions />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </TooltipProvider>
      </PrivyProvider>
    </HelmetProvider>
  );
};

export default App;
