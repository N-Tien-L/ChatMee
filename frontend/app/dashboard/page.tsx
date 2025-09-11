"use client";

import { useAuth } from "@/hook/useAuth";
import { useEffect } from "react";
import toast from "react-hot-toast";
import React from "react";

const Dashboard = () => {
  const { user, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    // Show success toast when user successfully reaches dashboard
    if (isAuthenticated && user) {
      toast.success(`Welcome to ChatMee, ${user.name}!`, {
        id: "dashboard-welcome",
        duration: 3000,
      });
    }
  }, [isAuthenticated, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl text-gray-600">
          Please log in to access the dashboard.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Dashboard</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            Welcome, {user?.name}!
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900">Profile Info</h3>
              <p className="text-blue-700">Email: {user?.email}</p>
              <p className="text-blue-700">Provider: {user?.provider}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold text-green-900">Quick Actions</h3>
              <p className="text-green-700">
                Start chatting, manage profile, and more!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
