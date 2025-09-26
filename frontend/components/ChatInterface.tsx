'use client'

import React, { useState, useRef, useEffect } from 'react';
import { Send, MoreVertical, Phone, Video, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useShallow } from 'zustand/react/shallow';
import { ChatRoomResponse } from '@/lib/type/ResponseType';

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  isOwn: boolean;
}

interface ChatInterfaceProps {
  roomId: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ roomId }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hello everyone! Welcome to the chat room.',
      sender: 'John Doe',
      timestamp: new Date(Date.now() - 60000),
      isOwn: false,
    },
    {
      id: '2',
      content: 'Hi there! Thanks for creating this room.',
      sender: 'You',
      timestamp: new Date(Date.now() - 30000),
      isOwn: true,
    },
    {
      id: '3',
      content: 'Great to see everyone here! Let\'s have a productive chat.',
      sender: 'Jane Smith',
      timestamp: new Date(Date.now() - 15000),
      isOwn: false,
    },
  ]);
  
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { rooms } = useChatRoomsStore(
    useShallow((state) => ({
      rooms: state.rooms,
    }))
  );

  const currentRoom = rooms.find(room => room.id === roomId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    const message: Message = {
      id: Date.now().toString(),
      content: newMessage.trim(),
      sender: 'You',
      timestamp: new Date(),
      isOwn: true,
    };

    setMessages(prev => [...prev, message]);
    setNewMessage('');
    
    // Simulate typing indicator
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      // Simulate a response (remove this in real implementation)
      const responseMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Thanks for your message!',
        sender: 'Bot',
        timestamp: new Date(),
        isOwn: false,
      };
      setMessages(prev => [...prev, responseMessage]);
    }, 1000);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  if (!currentRoom) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Room not found</h2>
          <p className="text-gray-500">The chat room you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold">
              {(currentRoom.displayName || currentRoom.roomName).charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {currentRoom.displayName || currentRoom.roomName}
              </h1>
              <p className="text-sm text-gray-500">
                {currentRoom.description || `${currentRoom.roomType.toLowerCase()} room`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" className="p-2">
            <Phone size={18} />
          </Button>
          <Button variant="ghost" size="sm" className="p-2">
            <Video size={18} />
          </Button>
          <Button variant="ghost" size="sm" className="p-2">
            <Info size={18} />
          </Button>
          <Button variant="ghost" size="sm" className="p-2">
            <MoreVertical size={18} />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => {
          const showDate = index === 0 || 
            formatDate(message.timestamp) !== formatDate(messages[index - 1].timestamp);
          
          return (
            <div key={message.id}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                    {formatDate(message.timestamp)}
                  </span>
                </div>
              )}
              
              <div className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-md ${message.isOwn ? 'order-2' : 'order-1'}`}>
                  {!message.isOwn && (
                    <p className="text-xs text-gray-500 mb-1 px-3">{message.sender}</p>
                  )}
                  <div
                    className={`px-4 py-2 rounded-2xl ${
                      message.isOwn
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                    <p className={`text-xs mt-1 ${
                      message.isOwn ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="max-w-xs lg:max-w-md">
              <div className="px-4 py-2 rounded-2xl bg-gray-100">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t bg-white">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="pr-12 rounded-full border-gray-300 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Button
            type="submit"
            disabled={!newMessage.trim()}
            className="rounded-full p-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;