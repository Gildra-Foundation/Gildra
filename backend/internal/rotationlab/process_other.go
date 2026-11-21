//go:build !windows

package rotationlab

import "os/exec"

func hideSimCWindow(*exec.Cmd) {}
