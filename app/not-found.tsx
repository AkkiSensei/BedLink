import React from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F4F6F4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '460px',
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E1E7E1',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <div
            style={{
              padding: '12px',
              backgroundColor: '#FEF3C7',
              borderRadius: '50%',
              color: '#B45309',
            }}
          >
            <AlertCircle size={32} />
          </div>
        </div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2421', margin: '0 0 0.5rem 0' }}>
          Page Not Found (404)
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#5C6B64', lineHeight: 1.5, margin: '0 0 1.75rem 0' }}>
          The requested BedLink operational route or resource could not be found. Please check the URL or return to the main portal.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 18px',
            backgroundColor: '#2D6A4F',
            color: '#FFFFFF',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.875rem',
            textDecoration: 'none',
            boxShadow: '0 2px 4px rgba(45, 106, 79, 0.2)',
          }}
        >
          <ArrowLeft size={16} />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    </div>
  )
}
