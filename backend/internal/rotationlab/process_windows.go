package rotationlab

import (
	"os/exec"
	"syscall"
)

func hideSimCWindow(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
