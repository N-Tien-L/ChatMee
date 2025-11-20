"use client";

import { useAuthStore } from "@/lib/stores";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProfilePage() {
    const { user } = useAuthStore();

    if (!user) {
        return <div className="p-8 text-center">Please log in to view your profile.</div>;
    }

    return (
        <div className="container mx-auto p-8 max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">User Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col items-center space-y-4">
                        <Avatar className="h-24 w-24">
                            <AvatarImage src={user.avatarUrl} alt={user.name} />
                            <AvatarFallback>{user.name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="text-center">
                            <h2 className="text-xl font-semibold">{user.name}</h2>
                            <p className="text-muted-foreground">{user.email}</p>
                        </div>
                    </div>

                    <div className="grid gap-4 border-t pt-4">
                        <div className="grid grid-cols-3 items-center">
                            <span className="font-medium text-muted-foreground">User ID</span>
                            <span className="col-span-2 font-mono text-sm">{user.id}</span>
                        </div>
                        <div className="grid grid-cols-3 items-center">
                            <span className="font-medium text-muted-foreground">Provider</span>
                            <span className="col-span-2 capitalize">{user.provider}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
