"use client";

import Link from "next/link";
import { ArrowLeft, LogOut, Mail, Fingerprint, KeyRound } from "lucide-react";
import { useAuthStore } from "@/lib/stores";
import { AuthGate } from "@/components/common/AuthGate";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RoomCover } from "@/components/common/RoomCover";
import { Button } from "@/components/ui/button";
import { BlockedUsersList } from "@/components/safety/BlockedUsersList";

const PROVIDER_LABELS: Record<string, string> = { google: "Google", github: "GitHub" };

function ProfileContent() {
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);

    if (!user) return null;

    const rows = [
        { icon: Mail, label: "Email", value: user.email, mono: false },
        { icon: KeyRound, label: "Signed in with", value: PROVIDER_LABELS[user.provider?.toLowerCase()] ?? user.provider, mono: false },
        { icon: Fingerprint, label: "User ID", value: user.id, mono: true },
    ];

    return (
        <div className="mx-auto w-full max-w-2xl p-4 sm:p-8">
            <Link
                href="/dashboard"
                className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to chats
            </Link>
            <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <RoomCover name={user.name} className="h-32 sm:h-40" />
                <div className="px-5 pb-6 sm:px-8">
                    <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="xl" className="-mt-12 ring-4 ring-card" />
                    <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em]">{user.name}</h1>
                    <p className="text-sm text-muted-foreground">{user.email}</p>

                    <dl className="mt-6 divide-y divide-border rounded-xl border border-border">
                        {rows.map(({ icon: Icon, label, value, mono }) => (
                            <div key={label} className="flex items-center gap-3 px-4 py-3">
                                <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                                <dt className="w-32 flex-shrink-0 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className={`min-w-0 flex-1 break-all text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-3 text-xs text-muted-foreground">
                        Your name and photo come from your sign-in provider and update when you sign in again.
                    </p>

                    <div className="mt-6">
                        <BlockedUsersList />
                    </div>

                    <div className="mt-6 border-t border-border pt-5">
                        <Button variant="outline" onClick={() => void logout()}>
                            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                            Sign out
                        </Button>
                    </div>
                </div>
            </article>
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
