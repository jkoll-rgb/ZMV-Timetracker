import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

// Types

export interface ActiveTimer {
  clientId: string
  clientName: string
  startTime: number // Date.now()
  project: string
  entryId: string
}

interface TimerContextType {
  activeTimer: ActiveTimer | null
  stream: MediaStream | null
  videoTrack: MediaStreamTrack | null
  screenshotCount: number
  elapsedSeconds: number
  clockIn: (clientId: string, clientName: string, project: string) => Promise<void>
  clockOut: () => Promise<void>
  captureScreenshot: () => Promise<void>
  reconnectStream: () => Promise<void>
}

const STORAGE_KEY = 'zmv_active_timer'

const TimerContext = createContext<TimerContextType | undefined>(undefined)

const getDisplayMediaOptions = (): DisplayMediaStreamOptions => ({
  video: {
    displaySurface: 'monitor',
    // @ts-expect-error vendor-specific constraint
    cursor: 'always',
  } as any,
  // @ts-expect-error vendor-specific constraints
  preferCurrentTab: false,
  selfBrowserSurface: 'exclude',
  monitorTypeSurfaces: 'include',
  surfaceSwitching: 'exclude',
} as any)

export function TimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as ActiveTimer) : null
    } catch {
      return null
    }
  })
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null)
  const [screenshotCount, setScreenshotCount] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const screenshotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firstScreenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const activeTimerRef = useRef<ActiveTimer | null>(activeTimer)

  useEffect(() => { activeTimerRef.current = activeTimer }, [activeTimer])
  useEffect(() => { streamRef.current = stream }, [stream])

  // Persist activeTimer to localStorage
  useEffect(() => {
    if (activeTimer) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeTimer))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [activeTimer])

  // Elapsed seconds tick
  useEffect(() => {
    if (!activeTimer) {
      setElapsedSeconds(0)
      return
    }
    setElapsedSeconds(Math.floor((Date.now() - activeTimer.startTime) / 1000))
    const iv = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - activeTimer.startTime) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [activeTimer])
  // Screenshot capture
  const captureScreenshot = useCallback(async () => {
    const currentStream = streamRef.current
    const timer = activeTimerRef.current
    if (!currentStream || !timer || !user) return

    const track = currentStream.getVideoTracks()[0]
    if (!track || track.readyState !== "live") return

    try {
      let bitmap: ImageBitmap
      try {
        const capture = new ImageCapture(track)
        bitmap = await capture.grabFrame()
      } catch {
        const video = document.createElement("video")
        video.srcObject = currentStream
        video.muted = true
        await video.play()
        bitmap = await createImageBitmap(video)
        video.pause()
        video.srcObject = null
      }

      const canvas = document.createElement("canvas")
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(bitmap, 0, 0)

      const now = new Date()
      const stamp = timer.clientName + "  |  " + now.toLocaleString("de-DE") + "  |  " + timer.project
      const barH = 36
      ctx.fillStyle = "rgba(0,0,0,0.6)"
      ctx.fillRect(0, canvas.height - barH, canvas.width, barH)
      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 18px monospace"
      ctx.fillText(stamp, 12, canvas.height - 12)

      const blob: Blob = await new Promise((res) =>
        canvas.toBlob((b) => res(b!), "image/jpeg", 0.7),
      )

      const filePath = user.id + "/" + timer.entryId + "/" + Date.now() + ".jpg"

      const { error: uploadErr } = await supabase.storage
        .from("screenshots")
        .upload(filePath, blob, { contentType: "image/jpeg" })
      if (uploadErr) {
        console.error("Screenshot upload failed:", uploadErr)
        return
      }

      const { data: urlData } = supabase.storage.from("screenshots").getPublicUrl(filePath)

      await supabase.from("screenshots").insert({
        time_entry_id: timer.entryId,
        image_url: urlData.publicUrl,
        comment: "Auto-Screenshot",
      })

      setScreenshotCount((c) => c + 1)
      bitmap.close()
    } catch (err) {
      console.error("Screenshot capture error:", err)
    }
  }, [user])
  const stopScreenshotCapture = useCallback(() => {
    if (firstScreenshotTimeoutRef.current) {
      clearTimeout(firstScreenshotTimeoutRef.current)
      firstScreenshotTimeoutRef.current = null
    }
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current)
      screenshotIntervalRef.current = null
    }
  }, [])

  const startScreenshotCapture = useCallback(() => {
    firstScreenshotTimeoutRef.current = setTimeout(() => {
      captureScreenshot()
      screenshotIntervalRef.current = setInterval(() => {
        captureScreenshot()
      }, 10 * 60 * 1000)
    }, 10 * 1000)
  }, [captureScreenshot])

  // clockOut internal
  const clockOutInternal = useCallback(async () => {
    const timer = activeTimerRef.current
    if (!timer) return

    const now = new Date()
    const durationMs = now.getTime() - timer.startTime
    const durationMinutes = Math.round(durationMs / 60000)
    const endStr = now.toTimeString().slice(0, 5)

    if (timer.entryId) {
      await supabase
        .from("time_entries")
        .update({
          end_time: endStr,
          duration_minutes: Math.max(durationMinutes, 1),
        })
        .eq("id", timer.entryId)
    }

    stopScreenshotCapture()

    const currentStream = streamRef.current
    if (currentStream) {
      currentStream.getTracks().forEach((t) => t.stop())
    }

    setStream(null)
    setVideoTrack(null)
    streamRef.current = null
    setActiveTimer(null)
    activeTimerRef.current = null
    setScreenshotCount(0)
    setElapsedSeconds(0)
  }, [stopScreenshotCapture])

  const clockOut = useCallback(async () => {
    await clockOutInternal()
  }, [clockOutInternal])
  // clockIn
  const clockIn = useCallback(
    async (clientId: string, clientName: string, project: string) => {
      if (!user) return

      const mediaStream = await navigator.mediaDevices.getDisplayMedia(getDisplayMediaOptions())
      const vTrack = mediaStream.getVideoTracks()[0]

      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10)
      const startStr = now.toTimeString().slice(0, 5)

      const { data: entryData } = await supabase
        .from("time_entries")
        .insert({
          zmv_id: user.id,
          client_id: clientId,
          date: dateStr,
          start_time: startStr,
          end_time: startStr,
          duration_minutes: 0,
          type: "vertraglich" as const,
          notes: project !== "Allgemein" ? project : null,
        })
        .select("id")
        .single()

      const entryId = entryData?.id ?? ""

      const timer: ActiveTimer = {
        clientId,
        clientName,
        startTime: Date.now(),
        project,
        entryId,
      }

      setStream(mediaStream)
      setVideoTrack(vTrack)
      streamRef.current = mediaStream
      setActiveTimer(timer)
      activeTimerRef.current = timer
      setScreenshotCount(0)
      setElapsedSeconds(0)

      // Start screenshot capture: first after 10s, then every 10min
      firstScreenshotTimeoutRef.current = setTimeout(() => {
        captureScreenshot()
        screenshotIntervalRef.current = setInterval(() => {
          captureScreenshot()
        }, 10 * 60 * 1000)
      }, 10 * 1000)

      // Auto clock-out when user stops sharing
      vTrack.addEventListener("ended", () => {
        clockOutInternal()
      })
    },
    [user, captureScreenshot, clockOutInternal],
  )
  // reconnectStream
  const reconnectStream = useCallback(async () => {
    if (!activeTimerRef.current) return

    const mediaStream = await navigator.mediaDevices.getDisplayMedia(getDisplayMediaOptions())
    const vTrack = mediaStream.getVideoTracks()[0]

    setStream(mediaStream)
    setVideoTrack(vTrack)
    streamRef.current = mediaStream

    stopScreenshotCapture()
    startScreenshotCapture()

    vTrack.addEventListener("ended", () => {
      clockOutInternal()
    })
  }, [stopScreenshotCapture, startScreenshotCapture, clockOutInternal])

  return (
    <TimerContext.Provider
      value={{
        activeTimer,
        stream,
        videoTrack,
        screenshotCount,
        elapsedSeconds,
        clockIn,
        clockOut,
        captureScreenshot,
        reconnectStream,
      }}
    >
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error("useTimer must be used within TimerProvider")
  return ctx
}
