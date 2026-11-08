'use client'

import { useState, useCallback, useRef } from 'react'
import { useSwipeDismiss } from '@/components/useSwipeDismiss'
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

  const handleLanguageChange = useCallback((lang: string) => {
    setConversation(prev => prev ? { ...prev, detected_language: lang } : prev)
  }, [])

  function handleSelect(id: number) {
    setSelectedConvId(id)
    setConversation(null)
    setMobileView('chat')
  }

  // Undo for archiving: a toast for a few seconds after a conversation is archived
  const [archivedId, setArchivedId] = useState<number | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showArchiveUndo = useCallback((id: number) => {
    setArchivedId(id)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setArchivedId(null), 6000)
  }, [])
  async function undoArchive() {
    if (archivedId === null) return
    await fetch(`/api/conversations/${archivedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: false }),
    })
    setArchivedId(null)
    handleMessageSent()
  }

  const aiSheetRef = useSwipeDismiss(() => setShowMobileAI(false), showMobileAI)

  function handleBack() {
    setMobileView('list')
    setShowMobileAI(false)
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-0">

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
          onArchived={showArchiveUndo}
          onOpenAI={() => setShowMobileAI(true)}
        />
      </div>

      {/* AI panel: a column on desktop; on mobile the same instance opens as a bottom
          sheet, so a drafted answer survives closing and reopening the sheet */}
      <div
        className={showMobileAI
          ? 'fixed inset-0 z-50 flex flex-col justify-end bg-black/50 md:static md:z-auto md:bg-transparent md:min-h-0 md:overflow-hidden'
          : 'hidden md:flex md:min-h-0 md:overflow-hidden'}
        onClick={e => { if (showMobileAI && e.target === e.currentTarget) setShowMobileAI(false) }}
      >
        <div ref={aiSheetRef} className={showMobileAI
          ? 'sheet-panel bg-surface-1 rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden safe-bottom md:contents'
          : 'contents'}
        >
          {showMobileAI && (
            <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col md:contents">
            <AIPanel
              conversation={conversation}
              onMessageSent={() => { handleMessageSent(); setShowMobileAI(false) }}
              onClose={() => setShowMobileAI(false)}
              sendChannel={sendChannel}
              onLanguageChange={handleLanguageChange}
            />
          </div>
        </div>
      </div>

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

      {archivedId !== null && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-[70] flex items-center gap-4 bg-text-primary text-white text-sm pl-4 pr-2 py-2 rounded-xl shadow-lg fade-in">
          <span>Gesprek gearchiveerd</span>
          <button onClick={undoArchive} className="font-semibold text-white underline underline-offset-2 px-2 py-1.5">
            Ongedaan maken
          </button>
        </div>
      )}
    </div>
  )
}
