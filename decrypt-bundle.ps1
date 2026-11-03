$targetDir = "E:\Steam\steamapps\common\KAMITSUBAKI_CITY_ENSEMBLE\KAMITSUBAKI CITY ENSEMBLE_Data\StreamingAssets\aa\StandaloneWindows64"
$password  = "sRWnupn2CUEFvwRAMNhUjm8PYWkX2R7r"

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

public static class BundleDecryptor
{
    public static byte[] DeriveKey(string password, string fileName)
    {
        // 对应 PasswordDeriveBytes(password, UTF8(fileName), "SHA1", 100).GetBytes(16)
        using (var pdb = new PasswordDeriveBytes(password,
                   Encoding.UTF8.GetBytes(fileName), "SHA1", 100))
            return pdb.GetBytes(16);
    }

    public static bool IsPlaintext(string path)
    {
        using (var fs = File.OpenRead(path))
        {
            if (fs.Length < 7) return false;
            var h = new byte[7];
            fs.Read(h, 0, 7);
            return Encoding.ASCII.GetString(h) == "UnityFS";
        }
    }

    public static void DecryptFile(string inPath, string outPath, string password, string fileName)
    {
        byte[] key = DeriveKey(password, fileName);

        using (var aes = Aes.Create())
        {
            aes.KeySize = 128;
            aes.Mode = CipherMode.ECB;
            aes.Padding = PaddingMode.None;
            aes.Key = key;
            using (var enc = aes.CreateEncryptor())
            using (var fsIn = new FileStream(inPath, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20))
            using (var fsOut = new FileStream(outPath, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20))
            {
                byte[] buffer = new byte[1 << 20];
                byte[] keystream = new byte[16];
                byte[] counterBlock = new byte[16];
                long counter = 1;
                int blockOffset = 0;

                int n;
                while ((n = fsIn.Read(buffer, 0, buffer.Length)) > 0)
                {
                    for (int i = 0; i < n; i++)
                    {
                        if (blockOffset == 0)
                        {
                            Array.Clear(counterBlock, 0, 16);
                            BitConverter.GetBytes(counter).CopyTo(counterBlock, 0);
                            enc.TransformBlock(counterBlock, 0, 16, keystream, 0);
                            counter++;
                        }
                        buffer[i] ^= keystream[blockOffset];
                        blockOffset = (blockOffset + 1) & 15;
                    }
                    fsOut.Write(buffer, 0, n);
                }
            }
        }
    }
}
"@ -Language CSharp

$files = Get-ChildItem -Path $targetDir -Filter "*.bundle" -File
Write-Host "找到 $($files.Count) 个 bundle 文件，开始处理..." -ForegroundColor Cyan

foreach ($file in $files) {
    $outPath = $file.FullName -replace '\.bundle$', '_dec.bundle'
    if (Test-Path $outPath) { Write-Host "[跳过] 已解密: $($file.Name)" -ForegroundColor DarkGray; continue }
    if ([BundleDecryptor]::IsPlaintext($file.FullName)) { Write-Host "[跳过] 明文: $($file.Name)" -ForegroundColor DarkGray; continue }

    Write-Host "[解密] $($file.Name) ..." -ForegroundColor Yellow
    try {
        $name = [System.IO.Path]::GetFileNameWithoutExtension($file.FullName)
        [BundleDecryptor]::DecryptFile($file.FullName, $outPath, $password, $name)
        Write-Host "  -> 成功" -ForegroundColor Green
    } catch {
        Write-Host "  -> 失败: $_" -ForegroundColor Red
    }
}