$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $serverJs = Join-Path $PSScriptRoot "server.js"
    if (Test-Path $serverJs) {
        & node $serverJs
        exit $LASTEXITCODE
    }
}

$basePath = Join-Path $PSScriptRoot "web"
if (-not (Test-Path $basePath)) {
    $basePath = Join-Path (Get-Location) "web"
}
$portsToTry = @(3000, 3001, 8080, 8085, 5000)
$listener = $null
$activePort = $null

foreach ($p in $portsToTry) {
    try {
        $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
        $l.Start()
        $listener = $l
        $activePort = $p
        break
    } catch {
        # Port in use, try next
    }
}

if (-not $listener) {
    Write-Host "Could not bind to any test port."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  MONAD QUEUE WEB APP IS LIVE!" -ForegroundColor Green
Write-Host "  URL: http://localhost:$activePort/" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green

while ($true) {
    try {
        $client = $listener.AcceptTcpClient()
        [System.Threading.ThreadPool]::QueueUserWorkItem({
            param($c, $dir)
            try {
                $stream = $c.GetStream()
                $buffer = New-Object byte[] 8192
                $read = $stream.Read($buffer, 0, $buffer.Length)
                if ($read -gt 0) {
                    $request = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
                    $firstLine = ($request -split "`r`n")[0]
                    $tokens = $firstLine -split ' '
                    $path = if ($tokens.Length -gt 1) { $tokens[1] } else { "/" }
                    if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }

                    $cleanPath = $path.Split('?')[0].TrimStart('/')
                    $targetFile = Join-Path $dir $cleanPath

                    if (Test-Path $targetFile -PathType Leaf) {
                        $content = [System.IO.File]::ReadAllBytes($targetFile)
                        $mime = "application/octet-stream"
                        if ($targetFile.EndsWith(".html")) { $mime = "text/html; charset=utf-8" }
                        elseif ($targetFile.EndsWith(".css")) { $mime = "text/css; charset=utf-8" }
                        elseif ($targetFile.EndsWith(".js")) { $mime = "application/javascript; charset=utf-8" }
                        elseif ($targetFile.EndsWith(".json")) { $mime = "application/json; charset=utf-8" }
                        elseif ($targetFile.EndsWith(".svg")) { $mime = "image/svg+xml" }

                        $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($content.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
                        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($content, 0, $content.Length)
                    } else {
                        $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
                        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($notFound.Length)`r`nConnection: close`r`n`r`n"
                        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                        $stream.Write($headerBytes, 0, $headerBytes.Length)
                        $stream.Write($notFound, 0, $notFound.Length)
                    }
                    $stream.Flush()
                }
            } catch {
                # Ignore stream errors
            } finally {
                $c.Close()
            }
        }, $client, $basePath) | Out-Null
    } catch {
        # Loop
    }
}
