'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, HelpCircle, X } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

interface AlertOptions {
  title?: string;
  message: string;
  confirmText?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

interface CustomDialogContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const CustomDialogContext = createContext<CustomDialogContextType | null>(null);

export function useDialog() {
  const context = useContext(CustomDialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a CustomDialogProvider');
  }
  return context;
}

interface DialogState {
  type: 'confirm' | 'alert';
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  alertType?: 'info' | 'success' | 'warning' | 'error';
  resolve: (value: any) => void;
}

export default function CustomDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (dialog) {
      // Trigger animations
      const timer = setTimeout(() => setAnimate(true), 20);
      return () => clearTimeout(timer);
    } else {
      setAnimate(false);
    }
  }, [dialog]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        type: 'confirm',
        title: options.title || 'Confirm Action',
        message: options.message,
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        isDanger: options.isDanger || false,
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions | string) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<void>((resolve) => {
      setDialog({
        type: 'alert',
        title: opts.title || 'Notification',
        message: opts.message,
        confirmText: opts.confirmText || 'Close',
        alertType: opts.type || 'info',
        resolve,
      });
    });
  }, []);

  const handleClose = (value: boolean) => {
    if (!dialog) return;
    setAnimate(false);
    // Wait for animation out
    setTimeout(() => {
      dialog.resolve(value);
      setDialog(null);
    }, 150);
  };

  const getIcon = () => {
    if (!dialog) return null;
    if (dialog.type === 'confirm') {
      if (dialog.isDanger) {
        return (
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-500 flex-shrink-0">
            <AlertTriangle size={20} />
          </div>
        );
      }
      return (
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-violet-500/10 border border-violet-500/20 text-violet-400 flex-shrink-0">
          <HelpCircle size={20} />
        </div>
      );
    } else {
      switch (dialog.alertType) {
        case 'success':
          return (
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex-shrink-0">
              <CheckCircle2 size={20} />
            </div>
          );
        case 'warning':
          return (
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-500 flex-shrink-0">
              <AlertTriangle size={20} />
            </div>
          );
        case 'error':
          return (
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-500 flex-shrink-0">
              <AlertTriangle size={20} />
            </div>
          );
        default:
          return (
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-400 flex-shrink-0">
              <Info size={20} />
            </div>
          );
      }
    }
  };

  return (
    <CustomDialogContext.Provider value={{ confirm, alert }}>
      {children}

      {dialog && (
        <div 
          onClick={() => handleClose(false)}
          className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-150 ease-out ${
            animate ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: "#111318", 
              border: dialog.isDanger || dialog.alertType === 'error' || dialog.alertType === 'warning'
                ? "1px solid rgba(239, 68, 68, 0.2)"
                : "1px solid rgba(255,255,255,0.08)", 
              borderRadius: "14px",
              boxShadow: dialog.isDanger || dialog.alertType === 'error' || dialog.alertType === 'warning'
                ? '0 10px 30px -10px rgba(239, 68, 68, 0.15)'
                : '0 10px 30px -10px rgba(124, 58, 237, 0.15)',
            }} 
            className={`p-6 max-w-md w-full shadow-2xl space-y-4 text-left transition-all duration-150 ease-out transform ${
              animate ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
          >
            <div className="flex items-start gap-4">
              {getIcon()}
              <div className="flex-1 space-y-1.5">
                <h3 className="text-sm font-semibold text-zinc-100 leading-none">
                  {dialog.title}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-normal whitespace-pre-wrap">
                  {dialog.message}
                </p>
              </div>
              <button 
                onClick={() => handleClose(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded-lg hover:bg-white/5"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              {dialog.type === 'confirm' && (
                <button
                  type="button"
                  onClick={() => handleClose(false)}
                  className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300 transition-colors border border-white/5"
                >
                  {dialog.cancelText}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleClose(true)}
                style={{
                  backgroundColor: dialog.isDanger || dialog.alertType === 'error' ? '#ef4444' : '#7c3aed',
                }}
                className={`h-9 px-4 rounded-lg text-white font-medium text-xs transition-all active:scale-95 duration-100 hover:brightness-110 shadow-md ${
                  dialog.isDanger || dialog.alertType === 'error' ? 'shadow-red-500/10' : 'shadow-violet-500/10'
                }`}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomDialogContext.Provider>
  );
}
