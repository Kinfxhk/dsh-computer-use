# Cua driver

This folder is where the Computer page looks for `cua-driver.exe`.

The binary is intentionally **not** committed: it is a third-party 28 MB executable from
[trycua/cua](https://github.com/trycua/cua), so the repo keeps it out of git history and uses the
official installer instead.

Install it once:

```powershell
irm https://cua.ai/driver/install.ps1 | iex
```

That places the driver at:

```text
%LOCALAPPDATA%\Programs\Cua\cua-driver\bin\cua-driver.exe
```

The plugin checks, in order:

1. `CUA_DRIVER_BIN`
2. `driver\cua-driver.exe` (this folder)
3. `%LOCALAPPDATA%\Programs\Cua\cua-driver\bin\cua-driver.exe`

So either let the installer do its thing, drop a copy here, or point `CUA_DRIVER_BIN` at it.
