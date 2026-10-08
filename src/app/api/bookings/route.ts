// GET, POST /api/bookings — тонкая обёртка над src/server.
import { handleCreateBooking, handleGetBookings } from "@/server/handlers";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => handleGetBookings(request);
export const POST = (request: Request) => handleCreateBooking(request);
