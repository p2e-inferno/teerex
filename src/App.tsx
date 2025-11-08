
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
import Attestations from "./pages/Attestations";
import Drafts from "./pages/Drafts";
import EventDetails from "./pages/EventDetails";
import Admin from "./pages/Admin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminEvents from "./pages/AdminEvents";
import AdminGaslessConfig from "./pages/AdminGaslessConfig";
import AdminRoute from "./components/routes/AdminRoute";
import NotFound from "./pages/NotFound";

const App = () => {
  return (
    <PrivyProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/create" element={<CreateEvent />} />
              <Route path="/events" element={<MyEvents />} />
              <Route path="/my-events" element={<MyEvents />} />
              <Route path="/my-tickets" element={<MyTickets />} />
              <Route path="/attestations" element={<Attestations />} />
              <Route path="/drafts" element={<Drafts />} />
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/schemas" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/admin/events" element={<AdminRoute><AdminEvents /></AdminRoute>} />
              <Route path="/admin/gasless" element={<AdminRoute><AdminGaslessConfig /></AdminRoute>} />
              <Route path="/event/:id" element={<EventDetails />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </TooltipProvider>
    </PrivyProvider>
  );
};

export default App;
