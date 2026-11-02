# Checks whether this Windows PC can run all of Chunga.
# Run: npm run check-cpu
# QVAC's speech engine (voice notes) needs AVX2; text checking works without it.

Add-Type -Namespace Chunga -Name Cpu -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(uint f);'
$avx  = [Chunga.Cpu]::IsProcessorFeaturePresent(39)   # PF_AVX_INSTRUCTIONS_AVAILABLE
$avx2 = [Chunga.Cpu]::IsProcessorFeaturePresent(40)   # PF_AVX2_INSTRUCTIONS_AVAILABLE
$cpu  = (Get-CimInstance Win32_Processor).Name
$ram  = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)

Write-Host "CPU:  $cpu"
Write-Host "RAM:  $ram GB"
Write-Host "AVX:  $avx"
Write-Host "AVX2: $avx2"
if ($avx2) { Write-Host "OK: text checks and voice notes should both work." }
else { Write-Host "Text checks will work. Voice notes will NOT (QVAC's speech engine needs AVX2)." }
if ($ram -lt 6) { Write-Host "Low RAM: close other apps (especially the browser tabs you don't need) while Chunga runs." }
