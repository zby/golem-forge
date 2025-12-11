# Browser Extension Code Review Notes

Date: 2025-12-08

## Completed Fixes

1. **AI SDK v6 property names** - `browser-runtime.ts:572-583`
   - Fixed: Used `textDelta` instead of `text`, `args` instead of `input`
   - Status: DONE

2. **API Key validation documentation** - `ai-service.ts:185-232`
   - Fixed: Updated JSDoc to clarify it's a "cheap" validation that doesn't call API
   - Status: DONE

3. **Masked key detection** - `sidepanel.tsx`
   - Fixed: Added `modifiedKeys` Set to track user edits instead of checking for `...`
   - Status: DONE

4. **Program deletion OPFS cleanup** - `program-manager.ts:103-115`
   - Fixed: Added `cleanupProgramSandbox()` function and called it on delete
   - Status: DONE

5. **Message ID collisions** - `sidepanel.tsx`
   - Fixed: Added `generateMessageId()` with counter for uniqueness
   - Status: DONE

6. **openSettings navigation** - `popup.tsx:175-178`, `background.ts`, `sidepanel.tsx`
   - Fixed: Opens sidepanel with settings tab via storage-based messaging
   - Status: DONE

7. **openProgram message handler** - `background.ts:100-105`
   - Fixed: Added handler to store pending program ID
   - Status: DONE

## Not Applicable (Code Refactored)

8. **Worker filtering feedback** - Was about workers being filtered silently
   - N/A: Code now uses bundled programs, no filtering needed
   - Status: SKIPPED

## Low Priority / Not Fixed

9. **Custom YAML parser complexity** - `worker-manager.ts:26-113`
   - ~140 lines for simple parsing, could be simplified
   - Status: NOT FIXED (works correctly)

10. **Unused mount system** - `opfs-sandbox.ts`
    - Full mount support but only root used
    - Status: NOT FIXED (may be needed in future)

11. **Inline styles** - 250+ lines in sidepanel.tsx
    - Status: NOT FIXED (cosmetic)

12. **No icon PNGs** - manifest expects icons
    - Status: NOT FIXED (cosmetic)

## Build Verification

- TypeScript compilation: PASSED
- Vite build: PASSED (2.54s)
