'use client'

import React, { useState, useEffect, useCallback, useTransition, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { loginWithPinAction, ROLE_PINS } from '../actions/auth'
import { 
  Building2, 
  Ambulance, 
  ClipboardList, 
  Lock, 
  Delete, 
  X, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
} from 'lucide-react'

interface RoleTabConfig {
  id: 'nurse' | 'dispatch' | 'hospital'
  label: string
  sublabel: string
  pin: string
  icon: React.ReactNode
  color: string
  softBg: string
  borderColor: string
  destination: string
}

const ROLE_TABS: RoleTabConfig[] = [
  {
    id: 'nurse',
    label: 'Nurse',
    sublabel: 'Apex Hospital Ward',
    pin: '2468',
    icon: <Building2 className="w-4 h-4" />,
    color: '#2D6A4F',
    softBg: '#E8F5E9',
    borderColor: '#A3D9C9',
    destination: '/nurse',
  },
  {
    id: 'dispatch',
    label: 'Dispatch Operator',
    sublabel: 'Metro EMS Console',
    pin: '9110',
    icon: <Ambulance className="w-4 h-4" />,
    color: '#B45309',
    softBg: '#FEF3C7',
    borderColor: '#FCD34D',
    destination: '/dispatch',
  },
  {
    id: 'hospital',
    label: 'Hospital Staff',
    sublabel: 'Apex Emergency Desk',
    pin: '1357',
    icon: <ClipboardList className="w-4 h-4" />,
    color: '#1565C0',
    softBg: '#E3F2FD',
    borderColor: '#90CAF9',
    destination: '/hospital',
  },
]

function LoginFormInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const urlError = searchParams.get('error')
  const isForbidden = searchParams.get('forbidden') === '1'
  const isUnauthorized = searchParams.get('unauthorized') === '1'
  const roleParam = searchParams.get('role')

  // PIN state
  const [pin, setPin] = useState('')
  const [activeTab, setActiveTab] = useState<'nurse' | 'dispatch' | 'hospital'>(() => {
    if (roleParam === 'dispatch' || roleParam === 'hospital' || roleParam === 'nurse') {
      return roleParam
    }
    return 'nurse'
  })

  useEffect(() => {
    if (roleParam === 'nurse' || roleParam === 'dispatch' || roleParam === 'hospital') {
      setActiveTab(roleParam)
    }
  }, [roleParam])

  let urlNotice: { title: string; description: string; type: 'error' | 'warning' } | null = null
  if (urlError === 'missing_profile') {
    urlNotice = {
      title: 'Operational Profile Required',
      description:
        'Your user account is authenticated, but is not mapped to an active hospital staff or dispatch profile in the database. Please select your operational console below and authenticate with the role PIN.',
      type: 'error',
    }
  } else if (isForbidden) {
    urlNotice = {
      title: 'Console Access Restricted',
      description:
        'Your account role does not have authorization to view the requested dashboard. Enter the authorized role PIN for that console below.',
      type: 'warning',
    }
  } else if (isUnauthorized) {
    urlNotice = {
      title: 'Authentication Required',
      description:
        'Please enter your operational role PIN to access the emergency coordination dashboard.',
      type: 'warning',
    }
  }

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [shake, setShake] = useState(false)

  // Traditional Email/Password Form toggle
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isPendingEmail, startEmailTransition] = useTransition()

  // Execute PIN submission
  const executePinSubmit = useCallback(async (pinToSubmit: string) => {
    if (isAuthenticating) return
    const clean = pinToSubmit.trim()
    setErrorMessage(null)

    const match = ROLE_PINS[clean]
    if (!match) {
      setErrorMessage('Invalid PIN. Use 2468 (Nurse), 9110 (Dispatch), or 1357 (Hospital Staff).')
      setShake(true)
      setTimeout(() => setShake(false), 600)
      setTimeout(() => setPin(''), 1000)
      return
    }

    setIsAuthenticating(true)
    setStatusMessage(`Authenticating ${match.roleTitle}...`)

    try {
      // 1. Call server action to securely set SSR cookies
      const serverResult = await loginWithPinAction(clean)
      if (!serverResult.success) {
        setErrorMessage(serverResult.error || 'Server authentication failed.')
        setIsAuthenticating(false)
        setStatusMessage(null)
        setPin('')
        return
      }

      // 2. Also authenticate client-side Supabase instance for synchronous browser cache
      await supabase.auth.signInWithPassword({
        email: match.email,
        password: 'DemoPassword123!',
      })

      setStatusMessage(`Access granted! Opening ${match.role.toUpperCase()} dashboard...`)

      // 3. Navigate to destination
      setTimeout(() => {
        router.push(match.destination)
        router.refresh()
      }, 250)
    } catch (err: any) {
      console.error('PIN authentication error:', err)
      setErrorMessage(err?.message || 'Login failed. Please try again.')
      setIsAuthenticating(false)
      setStatusMessage(null)
      setPin('')
    }
  }, [isAuthenticating, router, supabase])

  // Handle digit addition
  const handleDigit = useCallback((digit: string) => {
    if (isAuthenticating) return
    setErrorMessage(null)
    setPin((prev) => {
      if (prev.length >= 4) return prev
      const next = prev + digit
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(20)
      }
      if (next.length === 4) {
        setTimeout(() => executePinSubmit(next), 50)
      }
      return next
    })
  }, [isAuthenticating, executePinSubmit])

  // Backspace
  const handleBackspace = useCallback(() => {
    if (isAuthenticating) return
    setErrorMessage(null)
    setPin((prev) => prev.slice(0, -1))
  }, [isAuthenticating])

  // Clear
  const handleClear = useCallback(() => {
    if (isAuthenticating) return
    setErrorMessage(null)
    setPin('')
  }, [isAuthenticating])

  // Physical keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        handleDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleBackspace()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClear()
      } else if (e.key === 'Enter' && pin.length === 4) {
        e.preventDefault()
        executePinSubmit(pin)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleDigit, handleBackspace, handleClear, pin, executePinSubmit])

  // Quick 1-tap fill
  const handleQuickFill = (targetPin: string, tabId: 'nurse' | 'dispatch' | 'hospital') => {
    setActiveTab(tabId)
    setPin(targetPin)
    executePinSubmit(targetPin)
  }

  // Handle traditional email/password submission
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError(null)

    startEmailTransition(async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error || !data.user) {
        setEmailError(error?.message || 'Invalid email or password.')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle()

      const role = profile?.role as string | null
      const destination = 
        role === 'nurse' ? '/nurse' : 
        role === 'dispatch' ? '/dispatch' : 
        role === 'hospital' ? '/hospital' : '/nurse'

      router.push(destination)
      router.refresh()
    })
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F4F6F4',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.25rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '48px',
          height: '48px',
          backgroundColor: '#2D6A4F',
          borderRadius: '12px',
          marginBottom: '0.75rem',
          boxShadow: '0 4px 12px rgba(45, 106, 79, 0.25)',
        }}>
          <Link2 size={24} className="text-white" />
        </div>
        <h1 style={{
          fontSize: '1.6rem',
          fontWeight: 800,
          color: '#1A2421',
          letterSpacing: '-0.02em',
          margin: '0 0 0.25rem',
        }}>
          BedLink
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#5C6B64', margin: 0, fontWeight: 500 }}>
          Emergency Hospital-Bed Coordination Platform
        </p>
      </div>

      {/* Main Authentication Card */}
      <div style={{
        width: '100%',
        maxWidth: '430px',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E1E7E1',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        padding: '1.75rem',
        boxSizing: 'border-box',
      }}>
        {/* Auth Transition Error / Warning Banner */}
        {urlNotice && (
          <div
            role="alert"
            style={{
              marginBottom: '1.25rem',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              backgroundColor: urlNotice.type === 'error' ? '#FEF2F2' : '#FFFBEB',
              border: `1px solid ${urlNotice.type === 'error' ? '#FECACA' : '#FDE68A'}`,
              color: urlNotice.type === 'error' ? '#991B1B' : '#92400E',
              fontSize: '0.825rem',
              lineHeight: 1.45,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong style={{ display: 'block', fontWeight: 700, marginBottom: '2px' }}>
                {urlNotice.title}
              </strong>
              <span>{urlNotice.description}</span>
            </div>
          </div>
        )}

        {/* Role Selector Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '6px',
          backgroundColor: '#F4F6F4',
          padding: '4px',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          border: '1px solid #E1E7E1',
        }}>
          {ROLE_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id)
                  setErrorMessage(null)
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 4px',
                  borderRadius: '8px',
                  border: isActive ? `1.5px solid ${tab.borderColor}` : '1.5px solid transparent',
                  backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? tab.color : '#5C6B64',
                  boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '0.8rem' }}>
                  {tab.icon}
                  <span>{tab.label}</span>
                </div>
                <span style={{ 
                  fontSize: '0.7rem', 
                  fontFamily: 'monospace', 
                  fontWeight: 600,
                  marginTop: '2px',
                  color: isActive ? tab.color : '#8A9991',
                  letterSpacing: '0.04em'
                }}>
                  PIN: {tab.pin}
                </span>
              </button>
            )
          })}
        </div>

        {/* PIN Entry Prompt */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: ROLE_TABS.find(t => t.id === activeTab)?.color || '#2D6A4F',
            backgroundColor: ROLE_TABS.find(t => t.id === activeTab)?.softBg || '#E8F5E9',
            padding: '4px 10px',
            borderRadius: '20px',
            marginBottom: '0.5rem',
          }}>
            <Lock className="w-3.5 h-3.5" />
            <span>Enter 4-Digit Role PIN</span>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#5C6B64', margin: 0 }}>
            {activeTab === 'nurse' && 'Type 2468 to launch Nurse Inventory Console'}
            {activeTab === 'dispatch' && 'Type 9110 to launch Dispatch Operator Console'}
            {activeTab === 'hospital' && 'Type 1357 to launch Hospital Staff Desk'}
          </p>
        </div>

        {/* 4-Digit PIN Boxes */}
        <div 
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '0.75rem',
            transform: shake ? 'translateX(6px)' : 'none',
            transition: 'transform 100ms ease-in-out',
          }}
        >
          {[0, 1, 2, 3].map((index) => {
            const hasDigit = index < pin.length
            const isCurrent = index === pin.length && !isAuthenticating
            return (
              <div
                key={index}
                style={{
                  width: '48px',
                  height: '52px',
                  borderRadius: '12px',
                  border: errorMessage
                    ? '2px solid #E11D48'
                    : isCurrent
                    ? '2px solid #2D6A4F'
                    : hasDigit
                    ? '2px solid #2D6A4F'
                    : '2px solid #E1E7E1',
                  backgroundColor: errorMessage
                    ? '#FFF1F2'
                    : hasDigit
                    ? '#E8F5E9'
                    : '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isCurrent ? '0 0 0 3px rgba(45, 106, 79, 0.12)' : 'none',
                  transition: 'all 150ms ease',
                }}
              >
                {hasDigit ? (
                  <span style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#2D6A4F',
                    display: 'block',
                    animation: 'scaleIn 150ms ease',
                  }} />
                ) : (
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#CBD5E1',
                    display: 'block',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Status / Error feedback (fixed height to prevent layout jump) */}
        <div style={{
          minHeight: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
          textAlign: 'center',
          padding: '0 8px',
        }}>
          {isAuthenticating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2D6A4F', fontSize: '0.8rem', fontWeight: 600 }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{statusMessage || 'Verifying credentials…'}</span>
            </div>
          )}
          {!isAuthenticating && errorMessage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#E11D48', fontSize: '0.78rem', fontWeight: 600 }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {!isAuthenticating && !errorMessage && (
            <span style={{ fontSize: '0.75rem', color: '#8A9991' }}>
              Physical keyboard supported (type 0–9 or tap keys)
            </span>
          )}
        </div>

        {/* Clinical On-Screen Keypad */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginBottom: '1.25rem',
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isAuthenticating}
              onClick={() => handleDigit(String(num))}
              style={{
                height: '48px',
                borderRadius: '10px',
                border: '1.5px solid #E1E7E1',
                backgroundColor: '#FFFFFF',
                color: '#1A2421',
                fontSize: '1.15rem',
                fontWeight: 700,
                fontFamily: 'monospace',
                cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'background-color 100ms, transform 100ms, border-color 100ms',
              }}
              onMouseEnter={(e) => {
                if (!isAuthenticating) {
                  e.currentTarget.style.backgroundColor = '#F4F6F4'
                  e.currentTarget.style.borderColor = '#A3D9C9'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF'
                e.currentTarget.style.borderColor = '#E1E7E1'
              }}
              onMouseDown={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(0.96)')}
              onMouseUp={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(1)')}
            >
              {num}
            </button>
          ))}

          {/* Clear Key */}
          <button
            type="button"
            disabled={isAuthenticating}
            onClick={handleClear}
            title="Clear PIN"
            style={{
              height: '48px',
              borderRadius: '10px',
              border: '1.5px solid #E1E7E1',
              backgroundColor: '#F8FAF9',
              color: '#5C6B64',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: isAuthenticating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'background-color 100ms, transform 100ms',
            }}
            onMouseEnter={(e) => !isAuthenticating && (e.currentTarget.style.backgroundColor = '#EAEFEA')}
            onMouseLeave={(e) => !isAuthenticating && (e.currentTarget.style.backgroundColor = '#F8FAF9')}
            onMouseDown={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(1)')}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Zero Key */}
          <button
            type="button"
            disabled={isAuthenticating}
            onClick={() => handleDigit('0')}
            style={{
              height: '48px',
              borderRadius: '10px',
              border: '1.5px solid #E1E7E1',
              backgroundColor: '#FFFFFF',
              color: '#1A2421',
              fontSize: '1.15rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              cursor: isAuthenticating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'background-color 100ms, transform 100ms, border-color 100ms',
            }}
            onMouseEnter={(e) => {
              if (!isAuthenticating) {
                e.currentTarget.style.backgroundColor = '#F4F6F4'
                e.currentTarget.style.borderColor = '#A3D9C9'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF'
              e.currentTarget.style.borderColor = '#E1E7E1'
            }}
            onMouseDown={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(1)')}
          >
            0
          </button>

          {/* Backspace Key */}
          <button
            type="button"
            disabled={isAuthenticating}
            onClick={handleBackspace}
            title="Backspace"
            style={{
              height: '48px',
              borderRadius: '10px',
              border: '1.5px solid #E1E7E1',
              backgroundColor: '#F8FAF9',
              color: '#5C6B64',
              cursor: isAuthenticating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'background-color 100ms, transform 100ms',
            }}
            onMouseEnter={(e) => !isAuthenticating && (e.currentTarget.style.backgroundColor = '#EAEFEA')}
            onMouseLeave={(e) => !isAuthenticating && (e.currentTarget.style.backgroundColor = '#F8FAF9')}
            onMouseDown={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* 1-Tap Quick Action Row */}
        <div style={{
          borderTop: '1px solid #E1E7E1',
          paddingTop: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{
            fontSize: '0.72rem',
            color: '#5C6B64',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '2px',
          }}>
            1-Tap Demo Shortcuts
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <button
              type="button"
              disabled={isAuthenticating}
              onClick={() => handleQuickFill('2468', 'nurse')}
              style={{
                padding: '6px 4px',
                borderRadius: '8px',
                backgroundColor: '#E8F5E9',
                border: '1px solid #A3D9C9',
                color: '#2D6A4F',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                transition: 'opacity 150ms',
              }}
            >
              Nurse (2468)
            </button>

            <button
              type="button"
              disabled={isAuthenticating}
              onClick={() => handleQuickFill('9110', 'dispatch')}
              style={{
                padding: '6px 4px',
                borderRadius: '8px',
                backgroundColor: '#FEF3C7',
                border: '1px solid #FCD34D',
                color: '#B45309',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                transition: 'opacity 150ms',
              }}
            >
              Dispatch (9110)
            </button>

            <button
              type="button"
              disabled={isAuthenticating}
              onClick={() => handleQuickFill('1357', 'hospital')}
              style={{
                padding: '6px 4px',
                borderRadius: '8px',
                backgroundColor: '#E3F2FD',
                border: '1px solid #90CAF9',
                color: '#1565C0',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                transition: 'opacity 150ms',
              }}
            >
              Hospital (1357)
            </button>
          </div>
        </div>

        {/* Collapsible Email / Password option */}
        <div style={{ marginTop: '1.25rem', borderTop: '1px dashed #E1E7E1', paddingTop: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setShowEmailForm(!showEmailForm)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              width: '100%',
              background: 'none',
              border: 'none',
              color: '#5C6B64',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            <span>{showEmailForm ? 'Hide email sign-in' : 'Or sign in with email and password'}</span>
            {showEmailForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showEmailForm && (
            <form onSubmit={handleEmailLogin} style={{ marginTop: '0.75rem' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@bedlink.internal"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E1E7E1',
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E1E7E1',
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {emailError && (
                <div style={{ color: '#E11D48', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                  {emailError}
                </div>
              )}

              <button
                type="submit"
                disabled={isPendingEmail}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  backgroundColor: '#2D6A4F',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  border: 'none',
                  cursor: isPendingEmail ? 'not-allowed' : 'pointer',
                }}
              >
                {isPendingEmail ? 'Signing in…' : 'Sign in with Credentials'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div style={{
        marginTop: '1.25rem',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.75rem',
        color: '#5C6B64',
      }}>
        <ShieldCheck className="w-4 h-4 text-[#2D6A4F]" />
        <span>Authoritative Supabase PostgreSQL & Realtime Protected</span>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F6F4' }}>
          <Loader2 className="w-8 h-8 animate-spin text-[#2D6A4F]" />
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  )
}
