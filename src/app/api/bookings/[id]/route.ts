// PATCH, DELETE /api/bookings/:id — тонкая обёртка над src/server.
import { handleDeleteBooking, handleUpdateBooking } from "@/server/handlers";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export const PATCH = async (request: Request, { params }: Context) => handleUpdateBooking(request, (await params).id);
export const DELETE = async (request: Request, { params }: Context) => handleDeleteBooking(request, (await params).id);
