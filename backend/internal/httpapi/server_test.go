package httpapi

import "testing"

func TestWowIconURL(t *testing.T) {
	icon := "Ability_Warrior_SavageBlow"
	got := wowIconURL(&icon)
	if got == nil || *got != "https://render.worldofwarcraft.com/us/icons/56/ability_warrior_savageblow.jpg" {
		t.Fatalf("unexpected icon URL: %v", got)
	}
	unsafe := "../secret"
	if got := wowIconURL(&unsafe); got != nil {
		t.Fatalf("unsafe icon name must be rejected: %q", *got)
	}
}
