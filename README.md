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

## Using the app

The app opens on **Home**: your saved tabs (with a preview of their first line) and templates for starting a new one, including two examples: a technique showcase and an excerpt of "Nơi Này Có Anh" (fingerstyle arrangement by Mitxi Tòng, tab by Sang Pham) with chord names, let ring and string slaps. Tabs save automatically in the browser as you edit. Use **Home** in the editor's title bar to go back.

The editor layout puts what you use constantly at your fingertips and keeps rarely changed settings out of the way:

- **Title bar**: Home, tab title, save status, playback (play/pause, stop, loop, metronome, practice speed), undo/redo, shortcuts, panel toggles, Export PDF.
- **Properties bar** (rarely changed): song info (title, subtitle, artist, album, music/words/arrangement credits, copyright, optional PDF watermark), tempo, time signature, tuning, strings, capo.
- **Tools panel** (left, `Ctrl+[`): fret pad 0-24, durations, rest, chords and strumming (chord names, strum arrows, dynamics, section text), legato and slides, bends (incl. pre-bend), expression (vibrato, palm mute, let ring, harmonics: natural, artificial, pinch, tapped), articulation (accents, staccato, slap, pop, tremolo picking, trill, grace notes, fade in). Groups can be collapsed, hidden and reordered with the customize button; the arrangement is remembered.
- **Sheet**: the title block at the top (click it to edit song info), then the tab. Click a string and type a fret number; two quick digits enter frets 10-30. Empty beats stay blank; press `R` for a written rest.
- **Selection panel** (right, `Ctrl+]`): the selected note (fret, sounding pitch, techniques), beat and measure (time signature change, add, move, clear, delete).
- **Status bar**: track tabs (click to switch, click the active one for rename/delete, + to add), position, theme, zoom.

Press `?` in the editor for the full, searchable shortcut guide. The most used keys:

| Keys | Action |
| --- | --- |
| `0`-`9` | Enter fret on the selected string |
| Arrow keys | Move between beats and strings (Right at the end adds a beat or measure) |
| `Shift+1` ... `Shift+5` | Whole, half, quarter, eighth, sixteenth |
| `+` `-` `.` | Longer / shorter duration, dotted |
| `R`, `Delete` | Make rest, delete note |
| `H S B V P L N T G A` | Hammer/pull, slide, bend, vibrato, palm mute, let ring, harmonic, tap, ghost, accent |
| `X` | Dead note / string slap (works on an empty string) |
| `C`, `D`, `U` | Chord name, strum down, strum up |
| `Space`, `Shift+Space`, `M` | Play/pause, stop, metronome |
| `Ctrl+Z`, `Ctrl+Shift+Z` | Undo, redo |
| `Ctrl+P`, `Ctrl+I` | Print preview and PDF, song info |
| `Ctrl+[`, `Ctrl+]` | Show/hide tools panel, selection panel |

## Architecture

The music data model is independent of the UI and of rendering. Every visual surface (the editor sheet, the print preview and the PDF) draws the same display list, so the PDF matches what you see.

```
src/
  model/     Music data model: types, durations, tuning, pure immutable operations, factories
  editor/    Commands, undo/redo history, editor state machine (cursor, fret entry, navigation), keymap
  layout/    Tab layout engine (systems, measures, beat spacing, line wrapping) and drawing into
             renderer-neutral ops (lines, paths, text) — units are PDF points
  render/    SVG renderer for ops (editor, print preview, library thumbnails)
  audio/     Playback: schedule builder (pure), Karplus-Strong guitar synth, look-ahead transport
  pdf/       Pagination (A4 portrait/landscape, title block, page numbers) and the jsPDF writer
  io/        Portable JSON project format (validated import) and IndexedDB persistence
  ui/        React app: home library, editor (title bar, properties bar, tools panel, sheet, selection panel, status bar), dialogs
```

- **Data model** (`src/model/types.ts`): `Song` → `MasterBar[]` (per-measure time signature / tempo changes shared by all tracks) + `Track[]` (tuning, capo) → `Measure[]` → `Beat[]` (duration) → `Note[]` (string, fret, techniques). A beat without notes is a rest.
- **Editing**: every change runs through a `Command` (`src/editor/commands.ts`) that maps a song to a new song. Because songs are immutable with structural sharing (immer), history stores snapshots and undo/redo is exact. Rapid repeated edits (two-digit frets, typing a title) merge into one undo step.
- **Layout**: `layoutTrack` computes measure widths from note durations and label widths, packs measures into systems and justifies them. All sizes derive from the string gap, so zoom never moves notes relative to each other. The same function is used at screen width and at page width.
- **PDF**: `paginate` places whole systems on A4 pages (never split), adds the title block shared with the editor (title, subtitle, artist, credits), the track line (tuning, capo, tempo, time signature), running headers, page numbers, copyright and an optional diagonal watermark. `pagesToPdf` writes lines, Bézier paths and real text with jsPDF — no screenshots.
- **Playback**: `buildSchedule` turns the song into timed note events (ties, let ring, hammer-ons, slides, bends, harmonics, palm mutes, dead and ghost notes) plus metronome clicks. `GuitarSynth` voices them with Karplus-Strong plucked-string synthesis, and `PlaybackEngine` queues them slightly ahead on the audio clock so timing never depends on the UI frame rate.
- **Persistence**: projects are saved in IndexedDB; JSON import/export uses the `{ "format": "guitar-tab-studio", "version": 1, "song": … }` envelope and validates untrusted files.

Design tokens (colors, type, spacing) come from the Guitar Tab Studio design system and live in `src/ui/tokens.css` and `tailwind.config.js`.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Tab editor, note entry, measures, keyboard navigation, undo/redo, JSON persistence | Done |
| 2 | Rhythm notation, rests, techniques, tuning configuration, automatic layout | Done (standard-notation staff and key signature not yet) |
| 3 | Multipage vector PDF export and print preview | Done |
| 4 | Playback, metronome, loop, synchronized playhead | Done |
| 5 | ASCII tab import/export, accessibility pass, polish | Project management done; ASCII not started |
