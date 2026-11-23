package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Keep in sync with `desks` in client/src/world.ts (desks_test.go checks it).
var deskPositions = [...][2]float64{
	{-13.4, -12}, {-9.2, -12}, {-5, -12}, {-13.4, -8.5}, {-9.2, -8.5}, {-5, -8.5},
	{5, -12}, {13.4, -12}, {5, -8.5}, {13.4, -8.5},
}

const (
	deskReach    = 2.6
	maxDeskNotes = 6
	deskPlateMax = 20
	deskMoodMax  = 40
	deskNoteMax  = 80
)

type deskStyle struct {
	Top           string    `json:"top"`
	ChairColor    string    `json:"chairColor"`
	LampColor     string    `json:"lampColor"`
	LampOn        bool      `json:"lampOn"`
	KeyboardColor string    `json:"keyboardColor"`
	Wallpaper     string    `json:"wallpaper"`
	Items         [3]string `json:"items"`
	Plate         string    `json:"plate"`
	Mood          string    `json:"mood"`
	Status        string    `json:"status"`
	Poster        string    `json:"poster"`
	WallpaperURL  string    `json:"wallpaperURL"`
}

type deskNote struct {
	ID         string `json:"id"`
	AuthorHash string `json:"authorHash"`
	Author     string `json:"author"`
	Text       string `json:"text"`
	At         string `json:"at"`
}

type desk struct {
	OwnerHash string     `json:"ownerHash"`
	OwnerName string     `json:"ownerName"`
	Style     deskStyle  `json:"style"`
	Notes     []deskNote `json:"notes"`
}

var deskItems = []string{"none", "succulent", "cactus", "monstera", "mug", "books", "duck",
	"figurine", "snowglobe", "headphones", "monitor2", "lavalamp"}

func defaultDeskStyle(plate string) deskStyle {
	return deskStyle{
		Top: "oak", ChairColor: "#25333e", LampColor: "#ffb86b", LampOn: true,
		KeyboardColor: "#fff0d3", Wallpaper: "dawn", Items: [3]string{"succulent", "mug", "none"},
		Plate: clean(plate, deskPlateMax), Status: "available",
	}
}

// parseDeskStyle accepts only a complete, exact object, like parseAppearance.
func parseDeskStyle(raw json.RawMessage) (deskStyle, bool) {
	var s deskStyle
	if len(raw) == 0 || len(raw) > 6144 {
		return s, false
	}
	var fields map[string]json.RawMessage
	keys := []string{"top", "chairColor", "lampColor", "lampOn", "keyboardColor", "wallpaper",
		"items", "plate", "mood", "status", "poster", "wallpaperURL"}
	if json.Unmarshal(raw, &fields) != nil || len(fields) != len(keys) {
		return s, false
	}
	for _, key := range keys {
		if value, ok := fields[key]; !ok || string(value) == "null" {
			return s, false
		}
	}
	var items []string
	if json.Unmarshal(fields["items"], &items) != nil || len(items) != 3 {
		return s, false
	}
	if json.Unmarshal(raw, &s) != nil {
		return s, false
	}
	for _, item := range s.Items {
		if !oneOf(item, deskItems...) {
			return s, false
		}
	}
	// Reject absurd input; otherwise normalize like player names.
	if len(s.Plate) > 4*deskPlateMax || len(s.Mood) > 4*deskMoodMax {
		return s, false
	}
	s.Plate, s.Mood = clean(s.Plate, deskPlateMax), clean(s.Mood, deskMoodMax)
	return s, oneOf(s.Top, "oak", "walnut", "white", "black", "mint", "apricot", "lavender", "sky", "rose") &&
		clothingColor(s.ChairColor) && clothingColor(s.LampColor) && clothingColor(s.KeyboardColor) &&
		oneOf(s.Wallpaper, "dawn", "ocean", "forest", "grid", "stripes", "dots") &&
		oneOf(s.Status, "available", "busy", "away") &&
		(s.Poster == "" || validGIFURL(s.Poster)) &&
		(s.WallpaperURL == "" || validImageURL(s.WallpaperURL))
}

func validToken(token string) bool {
	if len(token) != 32 {
		return false
	}
	for _, r := range token {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f') {
			return false
		}
	}
	return true
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

type publicNote struct {
	ID     string `json:"id"`
	Author string `json:"author"`
	Text   string `json:"text"`
	At     string `json:"at"`
	Yours  bool   `json:"yours"`
}

type publicDesk struct {
	ID        int          `json:"id"`
	OwnerName string       `json:"ownerName"`
	Online    bool         `json:"online"`
	Style     *deskStyle   `json:"style"`
	Notes     []publicNote `json:"notes"`
}

// desksFor builds a per-recipient view. Token hashes never leave the server.
func (h *hub) desksFor(p *peer) map[string]any {
	online := map[string]bool{}
	for other := range h.peers {
		if other.tokenHash != "" {
			online[other.tokenHash] = true
		}
	}
	list := make([]publicDesk, len(h.desks))
	var mine any
	for i, d := range h.desks {
		list[i] = publicDesk{ID: i, Notes: []publicNote{}}
		if d == nil {
			continue
		}
		style := d.Style
		list[i].OwnerName, list[i].Online, list[i].Style = d.OwnerName, online[d.OwnerHash], &style
		if p.tokenHash != "" && d.OwnerHash == p.tokenHash {
			mine = i
		}
		for _, n := range d.Notes {
			list[i].Notes = append(list[i].Notes, publicNote{ID: n.ID, Author: n.Author, Text: n.Text, At: n.At,
				Yours: p.tokenHash != "" && n.AuthorHash == p.tokenHash})
		}
	}
	return map[string]any{"type": "desks", "desks": list, "mine": mine}
}

func (h *hub) broadcastDesks() {
	for p := range h.peers {
		h.send(p, h.desksFor(p))
	}
}

func (h *hub) ownedDesk(hash string) int {
	for i, d := range h.desks {
		if d != nil && hash != "" && d.OwnerHash == hash {
			return i
		}
	}
	return -1
}

func (h *hub) nearDesk(p *peer, id int) bool {
	pos := deskPositions[id]
	return math.Hypot(p.player.X-pos[0], p.player.Z-pos[1]) <= deskReach
}

// deskInput returns the target desk index, or -1 when absent or out of range.
func deskInput(m input) int {
	if m.Desk == nil || *m.Desk < 0 || *m.Desk >= len(deskPositions) {
		return -1
	}
	return *m.Desk
}

// handleDesk applies one desk command. It reports whether desk state changed.
func (h *hub) handleDesk(p *peer, m input, now time.Time) bool {
	id := deskInput(m)
	if id < 0 || p.tokenHash == "" {
		return false
	}
	d := h.desks[id]
	owner := d != nil && d.OwnerHash == p.tokenHash
	switch m.Type {
	case "desk-claim":
		if d != nil || h.ownedDesk(p.tokenHash) >= 0 || !h.nearDesk(p, id) {
			return false
		}
		h.desks[id] = &desk{OwnerHash: p.tokenHash, OwnerName: p.player.Name,
			Style: defaultDeskStyle(p.player.Name), Notes: []deskNote{}}
	case "desk-release":
		if !owner {
			return false
		}
		h.desks[id] = nil
	case "desk-update":
		if !owner {
			return false
		}
		if now.Sub(p.deskWindow) >= time.Second {
			p.deskWindow, p.deskCount = now, 0
		}
		p.deskCount++
		style, valid := parseDeskStyle(m.Style)
		if p.deskCount > 5 || !valid || style == d.Style {
			return false
		}
		d.Style, d.OwnerName = style, p.player.Name
	case "desk-note":
		text := clean(m.Text, deskNoteMax)
		if d == nil || text == "" || !h.nearDesk(p, id) || now.Sub(p.lastNote) < 5*time.Second {
			return false
		}
		noteID := make([]byte, 6)
		if _, err := rand.Read(noteID); err != nil {
			return false
		}
		p.lastNote = now
		d.Notes = append(d.Notes, deskNote{ID: hex.EncodeToString(noteID), AuthorHash: p.tokenHash,
			Author: p.player.Name, Text: text, At: now.UTC().Format(time.RFC3339)})
		if len(d.Notes) > maxDeskNotes {
			d.Notes = d.Notes[len(d.Notes)-maxDeskNotes:]
		}
	case "desk-note-remove":
		if d == nil {
			return false
		}
		for i, n := range d.Notes {
			if n.ID == m.Note && (owner || n.AuthorHash == p.tokenHash) {
				d.Notes = append(d.Notes[:i:i], d.Notes[i+1:]...)
				return true
			}
		}
		return false
	default:
		return false
	}
	return true
}

type desksFile struct {
	Version int     `json:"version"`
	Desks   []*desk `json:"desks"`
}

// loadDesks reads persisted desks. A corrupt file is moved aside rather than
// overwritten, so a bad deploy never silently destroys everyone's desks.
func loadDesks(path string) [len(deskPositions)]*desk {
	var result [len(deskPositions)]*desk
	if path == "" {
		return result
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return result
	}
	var file desksFile
	if err == nil {
		err = json.Unmarshal(data, &file)
	}
	if err == nil {
		err = validateDesksFile(file)
	}
	if err != nil {
		log.Printf("desks: ignoring %s: %v", path, err)
		if renameErr := os.Rename(path, path+".corrupt"); renameErr != nil {
			log.Printf("desks: could not move corrupt file aside: %v", renameErr)
		}
		return result
	}
	copy(result[:], file.Desks)
	return result
}

func validateDesksFile(file desksFile) error {
	if file.Version != 1 || len(file.Desks) > len(deskPositions) {
		return fmt.Errorf("unsupported version or desk count")
	}
	owners := map[string]bool{}
	for i, d := range file.Desks {
		if d == nil {
			continue
		}
		raw, _ := json.Marshal(d.Style)
		if _, ok := parseDeskStyle(raw); !ok || len(d.OwnerHash) != 64 || owners[d.OwnerHash] || len(d.Notes) > maxDeskNotes {
			return fmt.Errorf("invalid desk %d", i)
		}
		owners[d.OwnerHash] = true
		if d.Notes == nil {
			d.Notes = []deskNote{}
		}
	}
	return nil
}

// saveDesks writes atomically: a crash mid-write leaves the previous file intact.
func saveDesks(path string, desks [len(deskPositions)]*desk) error {
	if path == "" {
		return nil
	}
	data, err := json.MarshalIndent(desksFile{Version: 1, Desks: desks[:]}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".desks-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// validImageURL accepts any plain HTTPS link. The server never fetches it; each
// browser loads it as a CORS texture, and the image host sees viewers' IPs.
func validImageURL(value string) bool {
	if len(value) > 1500 || strings.TrimSpace(value) != value || strings.ContainsAny(value, " \t\r\n") {
		return false
	}
	u, err := url.Parse(value)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.Hostname() != "" && u.User == nil &&
		(u.Port() == "" || u.Port() == "443") && u.Fragment == ""
}
