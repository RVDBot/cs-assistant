'use client'

import { useState, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import ConversationList from '@/components/ConversationList'
import ChatWindow from '@/components/ChatWindow'
import AIPanel from '@/components/AIPanel'
import Settings from '@/components/Settings'
import ContextManager from '@/components/ContextManager'
import KnowledgeBase from '@/components/KnowledgeBase'
import Logs from '@/components/Logs'

interface Conversation {
  id: number
  customer_phone: string | null
  customer_email: string | null
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
  const [sendChannel, setSendChannel] = useState<'whatsapp' | 'email'>('whatsapp')

  // Mobile navigation: 'list' or 'chat'
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const [showMobileAI, setShowMobileAI] = useState(false)

  const handleConversationLoad = useCallback((conv: Conversation) => {
    setConversation(conv)
  }, [])

  const handleMessageSent = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  function handleSelect(id: number) {
    setSelectedConvId(id)
    setConversation(null)
    setMobileView('chat')
  }

  function handleBack() {
    setMobileView('list')
    setShowMobileAI(false)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-whatsapp-dark">

      {/* Conversation list — full screen on mobile when mobileView==='list', fixed width on desktop */}
      <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex flex-col h-full w-full md:w-auto overflow-hidden`}>
        <ConversationList
          selectedId={selectedConvId}
          onSelect={handleSelect}
          onOpenSettings={() => setShowSettings(true)}
          onOpenContext={() => setShowContext(true)}
          onOpenKnowledge={() => setShowKnowledge(true)}
        />
      </div>

      {/* Chat window — full screen on mobile when mobileView==='chat', flex-1 on desktop */}
      <div className={`${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden`}>
        <ChatWindow
          key={`${selectedConvId}-${refreshKey}`}
          conversationId={selectedConvId}
          onConversationLoad={handleConversationLoad}
          onMessageSent={handleMessageSent}
          onChannelChange={setSendChannel}
          onBack={handleBack}
          onOpenSettings={() => setShowSettings(true)}
          onOpenContext={() => setShowContext(true)}
          onOpenKnowledge={() => setShowKnowledge(true)}
        />
      </div>

      {/* AI panel — hidden on mobile (shown via floating button), visible on desktop */}
      <div className="hidden md:flex md:min-h-0 md:overflow-hidden">
        <AIPanel
          conversation={conversation}
          onMessageSent={handleMessageSent}
          sendChannel={sendChannel}
        />
      </div>

      {/* Mobile: floating AI button */}
      {mobileView === 'chat' && selectedConvId && (
        <button
          onClick={() => setShowMobileAI(true)}
          className="md:hidden fixed bottom-24 right-4 z-40 w-14 h-14 bg-whatsapp-teal rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <Sparkles className="w-6 h-6 text-white" />
        </button>
      )}

      {/* Mobile: AI panel bottom sheet */}
      {showMobileAI && (
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
          onClick={() => setShowMobileAI(false)}
        >
          <div
            className="bg-whatsapp-panel rounded-t-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 bg-whatsapp-border rounded-full" />
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col">
              <AIPanel
                conversation={conversation}
                onMessageSent={() => { handleMessageSent(); setShowMobileAI(false) }}
                onClose={() => setShowMobileAI(false)}
                sendChannel={sendChannel}
              />
            </div>
          </div>
        </div>
      )}

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
