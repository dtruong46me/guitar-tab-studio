# Guitar Tab Studio

A browser-based guitar tablature editor: compose, edit, preview and export tabs as print-ready **vector PDF**.

Compose → Edit → Preview → (Play) → Export PDF

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (model, editing commands, layout, PDF export, persistence)
npm run build      # type-check + production build into dist/
```

## Using the editor

Click a string on the sheet, then type a fret number. Two quick digits enter frets 10–30. Press `?` in the app for the full shortcut list.

| Keys | Action |
| --- | --- |
| `0`–`9` | Enter fret on the selected string |
| `←` `→` / `↑` `↓` | Previous/next beat (→ at the end adds a beat or a measure) / change string |
| `Ctrl+←` `Ctrl+→` | Previous / next measure |
| `+` `-` `.` | Longer / shorter duration, dotted |
| `R` | Make the beat a rest |
| `Delete` / `Shift+Delete` | Delete note / beat |
| `I` | Insert beat |
| `Alt+←/→`, `Alt+↑/↓` | Move beat; move note to another string keeping its pitch |
| `Ctrl+C/X/V` | Copy / cut / paste beats |
| `Ctrl+Enter`, `Ctrl+Delete` | Insert / delete measure |
| `H S B V P L N T G X` | Hammer/pull, slide, bend, vibrato, palm mute, let ring, harmonic, tap, ghost, dead note |
| `Ctrl+Z`, `Ctrl+Shift+Z` | Undo, redo |
| `Ctrl+S`, `Ctrl+P` | Save, print preview / export PDF |

## Architecture

The music data model is independent of the UI and of rendering. Every visual surface (the editor sheet, the print preview and the PDF) draws the same display list, so the PDF matches what you see.

```
src/
  model/     Music data model: types, durations, tuning, pure immutable operations, factories
  editor/    Commands, undo/redo history, editor state machine (cursor, fret entry, navigation), keymap
  layout/    Tab layout engine (systems, measures, beat spacing, line wrapping) and drawing into
             renderer-neutral ops (lines, paths, text) — units are PDF points
  render/    SVG renderer for ops (editor + print preview)
  pdf/       Pagination (A4 portrait/landscape, title block, page numbers) and the jsPDF writer
  io/        Portable JSON project format (validated import) and IndexedDB persistence
  ui/        React components: toolbar, sidebars, tab canvas, dialogs
```

- **Data model** (`src/model/types.ts`): `Song` → `MasterBar[]` (per-measure time signature / tempo changes shared by all tracks) + `Track[]` (tuning, capo) → `Measure[]` → `Beat[]` (duration) → `Note[]` (string, fret, techniques). A beat without notes is a rest.
- **Editing**: every change runs through a `Command` (`src/editor/commands.ts`) that maps a song to a new song. Because songs are immutable with structural sharing (immer), history stores snapshots and undo/redo is exact. Rapid repeated edits (two-digit frets, typing a title) merge into one undo step.
- **Layout**: `layoutTrack` computes measure widths from note durations and label widths, packs measures into systems and justifies them. All sizes derive from the string gap, so zoom never moves notes relative to each other. The same function is used at screen width and at page width.
- **PDF**: `paginate` places whole systems on A4 pages (never split), adds the title block (title, artist, tuning, capo, tempo, time signature), running headers and page numbers. `pagesToPdf` writes lines, Bézier paths and real text with jsPDF — no screenshots.
- **Persistence**: projects are saved in IndexedDB; JSON import/export uses the `{ "format": "guitar-tab-studio", "version": 1, "song": … }` envelope and validates untrusted files.

Design tokens (colors, type, spacing) come from the Guitar Tab Studio design system and live in `src/ui/tokens.css` and `tailwind.config.js`.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Tab editor, note entry, measures, keyboard navigation, undo/redo, JSON persistence | Done |
| 2 | Rhythm notation, rests, techniques, tuning configuration, automatic layout | Done (standard-notation staff and key signature not yet) |
| 3 | Multipage vector PDF export and print preview | Done |
| 4 | Playback, metronome, loop, synchronized playhead | Not started |
| 5 | ASCII tab import/export, accessibility pass, polish | Project management done; ASCII not started |
