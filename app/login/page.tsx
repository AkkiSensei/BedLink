'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loginWithPinAction } from '../actions/auth'
import { ROLE_PINS, getRoleByPin, ALL_HOSPITALS, ALL_NURSES } from '@/lib/auth/pins'
import { 
  Building2, 
  Ambulance, 
  ClipboardList, 
  Lock, 
  Delete, 
  X, 
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
    icon: <Building2 className="w-3.5 h-3.5" />,
    color: '#2D6A4F',
    softBg: '#E8F5E9',
    borderColor: '#A3D9C9',
    destination: '/nurse',
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    sublabel: 'Metro EMS Console',
    pin: '9110',
    icon: <Ambulance className="w-3.5 h-3.5" />,
    color: '#B45309',
    softBg: '#FEF3C7',
    borderColor: '#FCD34D',
    destination: '/dispatch',
  },
  {
    id: 'hospital',
    label: 'Hospital',
    sublabel: 'Apex Emergency Coordination',
    pin: '1001',
    icon: <ClipboardList className="w-3.5 h-3.5" />,
    color: '#1565C0',
    softBg: '#E3F2FD',
    borderColor: '#90CAF9',
    destination: '/hospital',
  },
]

function LoginFormInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlError = searchParams.get('error')
  const isForbidden = searchParams.get('forbidden') === '1'
  const isUnauthorized = searchParams.get('unauthorized') === '1'
  const roleParam = searchParams.get('role')

  // PIN state
  const [pin, setPin] = useState('')
  const pinInputRef = useRef<HTMLInputElement>(null)
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

  // Execute PIN submission
  const executePinSubmit = useCallback(async (pinToSubmit: string) => {
    if (isAuthenticating) return
    const clean = pinToSubmit.trim()
    setErrorMessage(null)

    const match = getRoleByPin(clean)
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
      // 1. Call server action to securely set authoritative SSR session cookies
      const serverResult = await loginWithPinAction(clean)
      if (!serverResult.success) {
        setErrorMessage(serverResult.error || 'Server authentication failed.')
        setIsAuthenticating(false)
        setStatusMessage(null)
        setPin('')
        return
      }

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
  }, [isAuthenticating, router])

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


  return (
    <div style={{
      height: '100dvh',
      maxHeight: '100dvh',
      width: '100%',
      overflow: 'hidden',
      backgroundColor: '#F4F6F4',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0.5rem 1rem',
      boxSizing: 'border-box',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '0.45rem' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '2px',
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            backgroundColor: '#2D6A4F',
            borderRadius: '7px',
            boxShadow: '0 2px 6px rgba(45, 106, 79, 0.25)',
          }}>
            <Link2 size={16} className="text-white" />
          </div>
          <h1 style={{
            fontSize: '1.25rem',
            fontWeight: 800,
            color: '#1A2421',
            letterSpacing: '-0.02em',
            margin: 0,
          }}>
            BedLink
          </h1>
        </div>
        <p style={{ fontSize: '0.72rem', color: '#5C6B64', margin: 0, fontWeight: 500 }}>
          Emergency Hospital-Bed Coordination Platform
        </p>
      </div>

      {/* Main Authentication Card */}
      <div style={{
        width: '100%',
        maxWidth: '380px',
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #E1E7E1',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        padding: '0.85rem 1.15rem',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}>
        {/* Auth Transition Error / Warning Banner */}
        {urlNotice && (
          <div
            role="alert"
            style={{
              marginBottom: '0.45rem',
              padding: '0.35rem 0.6rem',
              borderRadius: '8px',
              backgroundColor: urlNotice.type === 'error' ? '#FEF2F2' : '#FFFBEB',
              border: `1px solid ${urlNotice.type === 'error' ? '#FECACA' : '#FDE68A'}`,
              color: urlNotice.type === 'error' ? '#991B1B' : '#92400E',
              fontSize: '0.7rem',
              lineHeight: 1.3,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <strong style={{ fontWeight: 700, marginRight: '4px' }}>
                {urlNotice.title}:
              </strong>
              <span>{urlNotice.description}</span>
            </div>
          </div>
        )}

        {/* Role Selector Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          backgroundColor: '#F4F6F4',
          padding: '3px',
          borderRadius: '10px',
          marginBottom: '0.45rem',
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
                  height: '44px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '3px 2px',
                  borderRadius: '7px',
                  border: isActive ? `1.5px solid ${tab.borderColor}` : '1.5px solid transparent',
                  backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? tab.color : '#5C6B64',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  fontWeight: 700,
                  fontSize: '0.74rem',
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                }}>
                  {tab.icon}
                  <span>{tab.label}</span>
                </div>
                <span style={{ 
                  fontSize: '0.62rem', 
                  fontFamily: 'monospace', 
                  fontWeight: 600,
                  marginTop: '2px',
                  color: isActive ? tab.color : '#8A9991',
                  letterSpacing: '0.04em',
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                }}>
                  PIN: {tab.pin}
                </span>
              </button>
            )
          })}
        </div>

        {/* PIN Entry Prompt */}
        <div style={{ textAlign: 'center', marginBottom: '0.35rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: ROLE_TABS.find(t => t.id === activeTab)?.color || '#2D6A4F',
            backgroundColor: ROLE_TABS.find(t => t.id === activeTab)?.softBg || '#E8F5E9',
            padding: '2px 7px',
            borderRadius: '12px',
            marginBottom: '0.2rem',
          }}>
            <Lock className="w-3 h-3" />
            <span>Enter 4-Digit Role PIN</span>
          </div>

          <p style={{ fontSize: '0.7rem', color: '#5C6B64', margin: 0 }}>
            {activeTab === 'nurse' && 'Type 2001 or 2468 for Apex (or 2001–2010 for any hospital nurse)'}
            {activeTab === 'dispatch' && 'Type 9110 to launch Dispatch Operator Console'}
            {activeTab === 'hospital' && 'Type 1001 for Apex (or 1001–1010 for any hospital staff)'}
          </p>
        </div>

        {/* 4-Digit PIN Boxes & Mobile Numeric Input */}
        <div 
          onClick={() => pinInputRef.current?.focus()}
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '0.25rem',
            cursor: 'pointer',
            transform: shake ? 'translateX(6px)' : 'none',
            transition: 'transform 100ms ease-in-out',
          }}
        >
          {/* Accessible hidden input for mobile numeric keyboard & physical typing */}
          <input
            ref={pinInputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4)
              setPin(val)
              if (val.length === 4) {
                setTimeout(() => executePinSubmit(val), 50)
              }
            }}
            style={{
              position: 'absolute',
              opacity: 0,
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              cursor: 'pointer',
              fontSize: '16px',
            }}
            aria-label="4-digit role PIN"
          />

          {[0, 1, 2, 3].map((index) => {
            const hasDigit = index < pin.length
            const isCurrent = index === pin.length && !isAuthenticating
            return (
              <div
                key={index}
                style={{
                  width: '36px',
                  height: '38px',
                  borderRadius: '8px',
                  border: errorMessage
                    ? '2px solid #E11D48'
                    : isCurrent
                    ? '2px solid #2D6A4F'
                    : hasDigit
                    ? '2px solid #2D6A4F'
                    : '1.5px solid #E1E7E1',
                  backgroundColor: errorMessage
                    ? '#FFF1F2'
                    : hasDigit
                    ? '#E8F5E9'
                    : '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isCurrent ? '0 0 0 2px rgba(45, 106, 79, 0.12)' : 'none',
                  transition: 'all 120ms ease',
                }}
              >
                {hasDigit ? (
                  <span style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: '#2D6A4F',
                    display: 'block',
                  }} />
                ) : (
                  <span style={{
                    width: '5px',
                    height: '5px',
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
          minHeight: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '0.3rem',
          textAlign: 'center',
          padding: '0 4px',
        }}>
          {isAuthenticating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#2D6A4F', fontSize: '0.72rem', fontWeight: 600 }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{statusMessage || 'Verifying credentials…'}</span>
            </div>
          )}
          {!isAuthenticating && errorMessage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#E11D48', fontSize: '0.72rem', fontWeight: 600 }}>
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {!isAuthenticating && !errorMessage && (
            <span style={{ fontSize: '0.68rem', color: '#8A9991' }}>
              Physical keyboard supported (type 0–9 or tap keys)
            </span>
          )}
        </div>

        {/* Clinical On-Screen Keypad */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '5px',
          marginBottom: '0.45rem',
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isAuthenticating}
              onClick={() => handleDigit(String(num))}
              style={{
                height: '36px',
                borderRadius: '8px',
                border: '1.5px solid #E1E7E1',
                backgroundColor: '#FFFFFF',
                color: '#1A2421',
                fontSize: '1.05rem',
                fontWeight: 700,
                fontFamily: 'monospace',
                cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
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
              height: '36px',
              borderRadius: '8px',
              border: '1.5px solid #E1E7E1',
              backgroundColor: '#F8FAF9',
              color: '#5C6B64',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: isAuthenticating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'background-color 100ms, transform 100ms',
            }}
            onMouseEnter={(e) => !isAuthenticating && (e.currentTarget.style.backgroundColor = '#EAEFEA')}
            onMouseLeave={(e) => !isAuthenticating && (e.currentTarget.style.backgroundColor = '#F8FAF9')}
            onMouseDown={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(1)')}
          >
            <X className="w-4 h-4" />
          </button>

          {/* Zero Key */}
          <button
            type="button"
            disabled={isAuthenticating}
            onClick={() => handleDigit('0')}
            style={{
              height: '36px',
              borderRadius: '8px',
              border: '1.5px solid #E1E7E1',
              backgroundColor: '#FFFFFF',
              color: '#1A2421',
              fontSize: '1.05rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              cursor: isAuthenticating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
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
              height: '36px',
              borderRadius: '8px',
              border: '1.5px solid #E1E7E1',
              backgroundColor: '#F8FAF9',
              color: '#5C6B64',
              cursor: isAuthenticating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'background-color 100ms, transform 100ms',
            }}
            onMouseEnter={(e) => !isAuthenticating && (e.currentTarget.style.backgroundColor = '#EAEFEA')}
            onMouseLeave={(e) => !isAuthenticating && (e.currentTarget.style.backgroundColor = '#F8FAF9')}
            onMouseDown={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(0.96)')}
            onMouseUp={(e) => !isAuthenticating && (e.currentTarget.style.transform = 'scale(1)')}
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        {/* 1-Tap Quick Action Row */}
        <div style={{
          borderTop: '1px solid #E1E7E1',
          paddingTop: '0.4rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <div style={{
            fontSize: '0.65rem',
            color: '#5C6B64',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '1px',
          }}>
            {activeTab === 'hospital'
              ? 'Facility PIN Directory (1-Tap to Login)'
              : activeTab === 'nurse'
              ? 'Staff Nurse PIN Directory (1-Tap to Login)'
              : '1-Tap Demo Shortcuts'}
          </div>

          {activeTab === 'hospital' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{
                maxHeight: '74px',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '3px',
                paddingRight: '2px',
              }}>
                {ALL_HOSPITALS.map((hosp) => (
                  <button
                    key={hosp.hospitalId}
                    type="button"
                    disabled={isAuthenticating}
                    onClick={() => handleQuickFill(hosp.pin, 'hospital')}
                    style={{
                      padding: '3px 6px',
                      borderRadius: '5px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      color: '#0F172A',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 100ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E2E8F0')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '95px' }}>
                      {hosp.shortName}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1E40AF', backgroundColor: '#DBEAFE', padding: '1px 4px', borderRadius: '3px', fontSize: '0.62rem' }}>
                      {hosp.pin}
                    </span>
                  </button>
                ))}
              </div>

              {/* Super Admin Access Button */}
              <button
                type="button"
                disabled={isAuthenticating}
                onClick={() => handleQuickFill('0000', 'hospital')}
                style={{
                  width: '100%',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  color: '#92400E',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Super Administrator</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, backgroundColor: '#FDE68A', padding: '1px 5px', borderRadius: '3px', fontSize: '0.65rem' }}>
                  0000
                </span>
              </button>
            </div>
          ) : activeTab === 'nurse' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{
                maxHeight: '74px',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '3px',
                paddingRight: '2px',
              }}>
                {ALL_NURSES.map((nurse) => (
                  <button
                    key={nurse.hospitalId}
                    type="button"
                    disabled={isAuthenticating}
                    onClick={() => handleQuickFill(nurse.pin, 'nurse')}
                    style={{
                      padding: '3px 6px',
                      borderRadius: '5px',
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      color: '#166534',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 100ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#DCFCE7')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F0FDF4')}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '95px' }}>
                      {nurse.shortName}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#15803D', backgroundColor: '#DCFCE7', padding: '1px 4px', borderRadius: '3px', fontSize: '0.62rem' }}>
                      {nurse.pin}
                    </span>
                  </button>
                ))}
              </div>

              {/* Legacy Nurse Shortcut */}
              <button
                type="button"
                disabled={isAuthenticating}
                onClick={() => handleQuickFill('2468', 'nurse')}
                style={{
                  width: '100%',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  backgroundColor: '#E8F5E9',
                  border: '1px solid #A3D9C9',
                  color: '#2D6A4F',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Primary Ward Nurse (Apex Metro)</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, backgroundColor: '#C8E6C9', padding: '1px 5px', borderRadius: '3px', fontSize: '0.65rem' }}>
                  2468
                </span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              <button
                type="button"
                disabled={isAuthenticating}
                onClick={() => handleQuickFill('2468', 'nurse')}
                style={{
                  padding: '4px 2px',
                  borderRadius: '6px',
                  backgroundColor: '#E8F5E9',
                  border: '1px solid #A3D9C9',
                  color: '#2D6A4F',
                  fontSize: '0.68rem',
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
                  padding: '4px 2px',
                  borderRadius: '6px',
                  backgroundColor: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  color: '#B45309',
                  fontSize: '0.68rem',
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
                onClick={() => handleQuickFill('1001', 'hospital')}
                style={{
                  padding: '4px 2px',
                  borderRadius: '6px',
                  backgroundColor: '#E3F2FD',
                  border: '1px solid #90CAF9',
                  color: '#1565C0',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  cursor: isAuthenticating ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  transition: 'opacity 150ms',
                }}
              >
                Apex (1001)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div style={{
        marginTop: '0.35rem',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.68rem',
        color: '#5C6B64',
      }}>
        <ShieldCheck className="w-3.5 h-3.5 text-[#2D6A4F]" />
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
