'use client'

import { useState, useCallback } from 'react'
import ConversationList from '@/components/ConversationList'
import ChatWindow from '@/components/ChatWindow'
import AIPanel from '@/components/AIPanel'
import Settings from '@/components/Settings'
import ContextManager from '@/components/ContextManager'
import KnowledgeBase from '@/components/KnowledgeBase'
import Logs from '@/components/Logs'

interface Conversation {
  id: number
  customer_phone: string
  customer_name: string | null
  detected_language: string
  unread_count: number
}

export default function Home() {
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleConversationLoad = useCallback((conv: Conversation) => {
    setConversation(conv)
  }, [])

  const handleMessageSent = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-whatsapp-dark">
      {/* Left: Conversation list */}
      <ConversationList
        selectedId={selectedConvId}
        onSelect={id => { setSelectedConvId(id); setConversation(null) }}
        onOpenSettings={() => setShowSettings(true)}
        onOpenContext={() => setShowContext(true)}
        onOpenKnowledge={() => setShowKnowledge(true)}
      />

      {/* Middle: Chat window */}
      <ChatWindow
        key={`${selectedConvId}-${refreshKey}`}
        conversationId={selectedConvId}
        onConversationLoad={handleConversationLoad}
      />

      {/* Right: AI panel */}
      <AIPanel
        conversation={conversation}
        onMessageSent={handleMessageSent}
      />

      {/* Modals */}
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onOpenLogs={() => { setShowSettings(false); setShowLogs(true) }}
        />
      )}
      {showContext && <ContextManager onClose={() => setShowContext(false)} />}
      {showKnowledge && <KnowledgeBase onClose={() => setShowKnowledge(false)} />}
      {showLogs && <Logs onClose={() => setShowLogs(false)} />}
    </div>
  )
}
