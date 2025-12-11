# Documentation: https://docs.brew.sh/Cask-Cookbook
cask "lee-su-threads" do
  version "0.3.6"
  sha256 "99dac30f74040beb41185fb17f80491097e95fb68041be2ce96e0d9f49626227"

  url "https://github.com/KoukeNeko/lee-su-threads/releases/download/v#{version}/Lee-Su-Threads-v#{version}.zip"
  name "Lee-Su-Threads"
  desc "Safari extension that shows Threads user location info"
  homepage "https://github.com/meettomorrow/lee-su-threads"

  livecheck do
    url "https://github.com/KoukeNeko/lee-su-threads/releases"
    strategy :github_latest
  end

  app "Lee-Su-Threads.app"

  postflight do
    # Remove quarantine attribute for unsigned app
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Lee-Su-Threads.app"]
  end

  zap trash: [
    "~/Library/Containers/com.yourCompany..Extension",
    "~/Library/Preferences/com.yourCompany..plist",
  ]

  caveats <<~EOS
    To use this Safari extension, you need to:

    1. Open Safari Settings → Developer → Check "Allow unsigned extensions"
       (First enable Developer menu in Safari Settings → Advanced)

    2. Open Safari Settings → Extensions → Enable "Lee-Su-Threads 你是誰"

    3. Visit threads.com and browse your feed
  EOS
end
