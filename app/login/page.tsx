'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DEMO_ACCOUNTS = [
  {
    label: 'Nurse (Apex Hospital)',
    email: 'nurse.apex@bedlink.internal',
    password: 'DemoPassword123!',
    roleColor: '#2D6A4F',
    roleBg: '#E8F5E9',
    icon: '🏥',
    description: 'Update bed availability',
  },
  {
    label: 'Dispatch Operator',
    email: 'dispatch1@bedlink.internal',
    password: 'DemoPassword123!',
    roleColor: '#B45309',
    roleBg: '#FEF3C7',
    icon: '🚑',
    description: 'Emergency coordination console',
  },
  {
    label: 'Hospital Staff (Apex)',
    email: 'hospital.apex@bedlink.internal',
    password: 'DemoPassword123!',
    roleColor: '#1565C0',
    roleBg: '#E3F2FD',
    icon: '📋',
    description: 'Review and respond to offers',
  },
]

const ROLE_REDIRECTS: Record<string, string> = {
  nurse: '/nurse',
  dispatch: '/dispatch',
  hospital: '/hospital',
  admin: '/nurse',
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError || !data.user) {
        setError(authError?.message || 'Invalid credentials. Please try again.')
        return
      }

      // Resolve role from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle()

      const role = profile?.role as string | null
      const destination = (role && ROLE_REDIRECTS[role]) || '/nurse'
      router.push(destination)
      router.refresh()
    })
  }

  const handleDemoLogin = async (email: string, password: string) => {
    setError(null)
    setLoadingDemo(email)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !data.user) {
      setError(authError?.message || 'Demo login failed.')
      setLoadingDemo(null)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', data.user.id)
      .maybeSingle()

    const role = profile?.role as string | null
    const destination = (role && ROLE_REDIRECTS[role]) || '/nurse'
    router.push(destination)
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F4F6F4',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '52px',
          height: '52px',
          backgroundColor: '#2D6A4F',
          borderRadius: '14px',
          marginBottom: '1rem',
          boxShadow: '0 4px 12px rgba(45, 106, 79, 0.25)',
        }}>
          <span style={{ fontSize: '24px' }}>🔗</span>
        </div>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          color: '#1A2421',
          letterSpacing: '-0.02em',
          margin: '0 0 0.25rem',
        }}>
          BedLink
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#5C6B64', margin: 0 }}>
          Emergency Hospital-Bed Coordination
        </p>
      </div>

      {/* Login Card */}
      <div style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E1E7E1',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        padding: '2rem',
      }}>
        <h2 style={{
          fontSize: '1.1rem',
          fontWeight: 700,
          color: '#1A2421',
          margin: '0 0 1.5rem',
        }}>
          Sign in to your account
        </h2>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#1A2421',
              marginBottom: '0.375rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Email address
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '1.5px solid #E1E7E1',
                fontSize: '0.9rem',
                color: '#1A2421',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                transition: 'border-color 150ms',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#2D6A4F'}
              onBlur={e => e.currentTarget.style.borderColor = '#E1E7E1'}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#1A2421',
              marginBottom: '0.375rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '1.5px solid #E1E7E1',
                fontSize: '0.9rem',
                color: '#1A2421',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                transition: 'border-color 150ms',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#2D6A4F'}
              onBlur={e => e.currentTarget.style.borderColor = '#E1E7E1'}
            />
          </div>

          {error && (
            <div style={{
              backgroundColor: '#FFF1F2',
              border: '1px solid #FECDD3',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              color: '#E11D48',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: '100%',
              padding: '0.875rem',
              backgroundColor: isPending ? '#5C6B64' : '#2D6A4F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: isPending ? 'not-allowed' : 'pointer',
              transition: 'background-color 150ms',
              letterSpacing: '0.01em',
            }}
          >
            {isPending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Demo Accounts Section */}
        <div style={{ marginTop: '2rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E1E7E1' }} />
            <span style={{ fontSize: '0.75rem', color: '#5C6B64', fontWeight: 500 }}>
              DEMO ACCOUNTS
            </span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#E1E7E1' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                onClick={() => handleDemoLogin(account.email, account.password)}
                disabled={loadingDemo !== null}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.875rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: loadingDemo === account.email ? '#F4F6F4' : '#FFFFFF',
                  border: '1.5px solid #E1E7E1',
                  borderRadius: '10px',
                  cursor: loadingDemo !== null ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 150ms, background-color 150ms',
                  width: '100%',
                  opacity: loadingDemo !== null && loadingDemo !== account.email ? 0.6 : 1,
                }}
                onMouseEnter={e => {
                  if (!loadingDemo) {
                    e.currentTarget.style.borderColor = account.roleColor
                    e.currentTarget.style.backgroundColor = account.roleBg
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#E1E7E1'
                  e.currentTarget.style.backgroundColor = '#FFFFFF'
                }}
              >
                <span style={{
                  fontSize: '1.25rem',
                  width: '2rem',
                  textAlign: 'center',
                  flexShrink: 0,
                }}>
                  {loadingDemo === account.email ? '⏳' : account.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#1A2421',
                    lineHeight: 1.2,
                  }}>
                    {account.label}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#5C6B64',
                    marginTop: '0.125rem',
                  }}>
                    {loadingDemo === account.email ? 'Signing in…' : account.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <p style={{
        marginTop: '1.5rem',
        fontSize: '0.75rem',
        color: '#5C6B64',
        textAlign: 'center',
        maxWidth: '360px',
      }}>
        BedLink — Emergency hospital-bed coordination platform.
        Demo data uses a shared hosted database.
      </p>
    </div>
  )
}
