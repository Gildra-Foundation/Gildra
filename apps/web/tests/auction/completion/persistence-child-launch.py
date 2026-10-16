"""Launch one real Node process without inheriting Node's spawn restrictions."""
import subprocess
import sys

try:
    result = subprocess.run(sys.argv[1:], capture_output=True, timeout=15, check=False)
except subprocess.TimeoutExpired:
    print("Restart test child exceeded its 15 second deadline", file=sys.stderr)
    sys.exit(124)
sys.stdout.buffer.write(result.stdout)
sys.stderr.buffer.write(result.stderr)
sys.exit(result.returncode)
