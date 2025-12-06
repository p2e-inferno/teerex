import { useEffect, useMemo, useState, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { GetStartedSteps } from "@/components/GetStartedSteps";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Users, Zap, ArrowRight, Calendar, MapPin, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { getPublishedEvents, type PublishedEvent } from "@/utils/eventUtils";
import {
  selectFeaturedEvents,
  selectUpcomingEvents,
  fetchKeysSoldForEvents,
  computeHomeStats,
  getTotalTicketsSold,
} from "@/lib/home/homeData";
import MetaTags from "@/components/MetaTags";

const Index = () => {
  const { authenticated, ready } = usePrivy();
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<PublishedEvent[]>([]);
  const [featured, setFeatured] = useState<PublishedEvent[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [upcoming, setUpcoming] = useState<PublishedEvent[]>([]);
  const [keysSold, setKeysSold] = useState<Record<string, number>>({});
  const [totalTickets, setTotalTickets] = useState(0);
  const [isCarouselHovered, setIsCarouselHovered] = useState(false);
  const carouselTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Fetch all published events
        const all = await getPublishedEvents();
        if (!mounted) return;
        setEvents(all);

        // Select featured and upcoming events for display
        const feat = selectFeaturedEvents(all, 3);
        const upc = selectUpcomingEvents(all, 3);
        setFeatured(feat);
        setUpcoming(upc);

        // Fetch per-event ticket counts for featured/upcoming cards
        const subset = [...feat, ...upc].filter(Boolean) as PublishedEvent[];
        const sold = await fetchKeysSoldForEvents(subset);
        if (!mounted) return;
        setKeysSold(sold);

        // Fetch total platform-wide ticket count for stats
        const total = await getTotalTicketsSold();
        if (!mounted) return;
        setTotalTickets(total);
      } catch (e) {
        console.error("Error loading home data:", e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-cycling carousel logic with hover pause
  useEffect(() => {
    // Only cycle if there are 2+ featured events and carousel is not hovered
    if (featured.length <= 1 || isCarouselHovered) {
      // Clear existing timer if carousel is hovered
      if (carouselTimerRef.current) {
        clearInterval(carouselTimerRef.current);
        carouselTimerRef.current = null;
      }
      return;
    }

    // Start auto-cycle timer
    carouselTimerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % featured.length);
    }, 5000); // Cycle every 5 seconds

    return () => {
      if (carouselTimerRef.current) {
        clearInterval(carouselTimerRef.current);
        carouselTimerRef.current = null;
      }
    };
  }, [featured.length, isCarouselHovered]);

  // Handler for manual slide navigation - resets timer
  const handleSlideChange = (index: number) => {
    setCurrentSlide(index);

    // Clear existing timer
    if (carouselTimerRef.current) {
      clearInterval(carouselTimerRef.current);
      carouselTimerRef.current = null;
    }

    // Restart timer if not hovered
    if (!isCarouselHovered && featured.length > 1) {
      carouselTimerRef.current = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % featured.length);
      }, 5000);
    }
  };

  const stats = useMemo(() => computeHomeStats(events, totalTickets), [events, totalTickets]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <>
      <MetaTags
        title="TeeRex - Create & Discover Onchain Events"
        description="Join the future of events with TeeRex. Create unforgettable experiences with blockchain-verified tickets, gasless transactions, and Web3-powered communities. Discover and attend events that matter."
        url="/"
      />
      <div className="min-h-screen bg-white">
      {/* Hero Section - Luma-inspired clean layout */}
      <section className="pt-20 pb-16">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-16">
            <Badge className="bg-purple-50 text-purple-700 border-purple-200 mb-6 text-sm font-medium px-4 py-2">
              Web3 Events Platform
            </Badge>
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Create events that <span className="text-purple-600">matter</span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12 leading-relaxed">
              Host memorable events with blockchain-verified tickets, onchain
              attestations, and seamless payment processing. Built for the
              future of events.
            </p>

            {authenticated && (
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                <Button
                  size="lg"
                  className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 text-lg font-medium rounded-xl"
                  asChild
                >
                  <Link to="/create">
                    Create Event
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg font-medium rounded-xl"
                  asChild
                >
                  <Link to="/explore">Browse Events</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Get Started Steps Section */}
          <GetStartedSteps />

          {/* Featured Event Carousel - Auto-cycling event showcase */}
          <div className="max-w-4xl mx-auto">
            {featured.length > 0 ? (
              <div
                className="relative overflow-hidden"
                onMouseEnter={() => setIsCarouselHovered(true)}
                onMouseLeave={() => setIsCarouselHovered(false)}
              >
                <div
                  className="flex transition-transform duration-500 ease-in-out"
                  style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                >
                  {featured.map((event) => (
                    <div key={event.id} className="min-w-full">
                      <Link to={`/event/${event.lock_address}`} className="block group">
                        <Card className="overflow-hidden border-0 shadow-lg bg-white">
                          <div className="aspect-[2/1] relative cursor-pointer">
                            <img
                              src={event.image_url}
                              alt={event.title}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30" />
                            <div className="absolute bottom-6 left-6 right-6 text-white">
                              <Badge className="bg-white/20 text-white border-white/30 mb-3">
                                Featured Event
                              </Badge>
                              <h3 className="text-2xl font-bold mb-2">
                                {event.title}
                              </h3>
                              <div className="flex flex-wrap items-center gap-4 text-white/90">
                                {event.date && (
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    <span>{format(event.date, 'MMM d, yyyy')}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-4 h-4" />
                                  <span>{event.location}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4" />
                                  <span>{keysSold[event.id] ?? 0} attending</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    </div>
                  ))}
                </div>

                {/* Navigation Dots - Only show if multiple events */}
                {featured.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                    {featured.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSlideChange(idx)}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                          idx === currentSlide
                            ? 'bg-white w-6'
                            : 'bg-white/50 hover:bg-white/75'
                        }`}
                        aria-label={`Go to slide ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Card className="overflow-hidden border-0 shadow-lg bg-white">
                <div className="aspect-[2/1] relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500" />
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="absolute bottom-6 left-6 right-6 text-white">
                    <Badge className="bg-white/20 text-white border-white/30 mb-3">
                      Featured Event
                    </Badge>
                    <h3 className="text-2xl font-bold mb-2">
                      {isLoading ? 'Loading…' : 'No featured event yet'}
                    </h3>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* Features Section - Clean card grid */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Everything you need
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Powerful tools to create, manage, and verify your events with Web3
              technology
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-0 shadow-sm hover:shadow-lg transition-shadow duration-300 bg-white">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle className="text-xl font-semibold text-gray-900">
                  Verifiable Tickets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 leading-relaxed">
                  Create tamper-proof tickets using blockchain technology. Each
                  ticket is unique and verifiable.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm hover:shadow-lg transition-shadow duration-300 bg-white">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle className="text-xl font-semibold text-gray-900">
                  On-Chain Attestations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 leading-relaxed">
                  Build reputation and verify attendance with permanent on-chain
                  attestations.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm hover:shadow-lg transition-shadow duration-300 bg-white">
              <CardHeader className="pb-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-xl font-semibold text-gray-900">
                  Flexible Payments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600 leading-relaxed">
                  Accept both cryptocurrency and fiat payments with seamless
                  checkout experience.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section - Minimal and clean */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">{stats.eventsCount}</div>
              <div className="text-gray-600">Events</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">{stats.ticketsSold.toLocaleString()}</div>
              <div className="text-gray-600">Tickets Sold</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">{stats.creatorCount}</div>
              <div className="text-gray-600">Creators</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900 mb-2">{stats.chainsCount}</div>
              <div className="text-gray-600">Chains</div>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Events Preview - Luma-style event list */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Upcoming Events
              </h2>
              <p className="text-gray-600">
                Discover amazing events happening soon
              </p>
            </div>
            <Button
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
              asChild
            >
              <Link to="/explore">View All</Link>
            </Button>
          </div>

          <div className="space-y-4">
            {upcoming.map((e) => (
              <Link key={e.id} to={`/event/${e.lock_address}`} className="block group">
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl flex items-center justify-center">
                          <Calendar className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600">
                            {e.title}
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span>{e.date ? format(e.date, 'MMM d, yyyy') : 'TBA'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              <span>{e.location}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-gray-900">
                          {e.payment_methods?.includes('fiat') && e.ngn_price > 0
                            ? `₦${e.ngn_price.toLocaleString()}`
                            : e.currency === 'FREE' ? 'Free' : `${e.price} ${e.currency}`}
                        </div>
                        <div className="text-sm text-gray-600">
                          {Math.max(0, e.capacity - (keysSold[e.id] ?? 0))} spots left
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Clean and focused */}
      {authenticated && (
        <section className="py-20 bg-white">
          <div className="container mx-auto px-6 max-w-4xl text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Ready to create your first event?
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of event creators who trust TeeRex for their Web3
              events
            </p>
            <Button
              size="lg"
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 text-lg font-medium rounded-xl"
              asChild
            >
              <Link to="/create">
                Create Your Event
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </section>
      )}
    </div>
    </>
  );
};

export default Index;
