"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/lib/stores";
import { AuthGate } from "@/components/common/AuthGate";
import { UserAvatar } from "@/components/common/UserAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ProfileContent() {
    const user = useAuthStore((state) => state.user);

    if (!user) return null;

    return (
        <div className="container mx-auto p-4 sm:p-8 max-w-2xl">
            <Link
                href="/dashboard"
                className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to chats
            </Link>
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">User Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col items-center space-y-4">
                        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="xl" />
                        <div className="text-center">
                            <h2 className="text-xl font-semibold">{user.name}</h2>
                            <p className="text-muted-foreground">{user.email}</p>
                        </div>
                    </div>

                    <div className="grid gap-4 border-t pt-4">
                        <div className="grid grid-cols-3 items-center">
                            <span className="font-medium text-muted-foreground">User ID</span>
                            <span className="col-span-2 font-mono text-sm break-all">{user.id}</span>
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

export default function ProfilePage() {
    return (
        <AuthGate>
            <ProfileContent />
        </AuthGate>
    );
}
