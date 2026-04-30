# BuffagoApp
🍗 BuffaGo

BuffaGo is a gamified mobile app for discovering, rating, and tracking the best chicken wings through curated “wing crawls.”

More game, less dashboard.

🚀 What is BuffaGo?

BuffaGo turns finding great wings into an experience.

Explore curated crawls (up to 5 stops)
Rate wings with a fast, fun slider system
Earn XP, level up, and build your Wingdex
Track progress and compare with others
Discover top wing spots near you or while traveling
🤖 AI Powered: Wingman

BuffaGo includes an AI-powered assistant called Wingman.

Wingman helps:

Interpret messy or incomplete restaurant searches
Normalize user input into structured data
Validate real restaurants before adding them
Maintain data quality with confidence-based decisioning

This allows users to contribute new spots without sacrificing accuracy.

🎮 Core Features
Wing Crawls
Structured, multi-stop routes for real-world food exploration
Rating System
Score wings across:
Crispiness
Sauce
Meat
Overall
Gamification
XP + leveling system
Daily activity bonuses
Streak tracking
Progress visualization
Public Ratings
Search + filters
Tag-based insights
Community-driven scoring
Guest Mode
No account required
Optional sign-in for progress tracking
🛠 Tech Stack
Frontend: Expo (React Native), Expo Router, React Native Paper
Backend: Supabase (Postgres + RLS)
Maps & Routing: Google Maps + Directions API
AI: OpenAI API (Wingman assistant)
Auth: Supabase Auth (email + guest support)
🧠 AI / System Design Highlights
LLM-assisted entity resolution for restaurant input
Structured extraction from unstructured text
Confidence-based validation before database writes
Fallback logic to prevent bad data insertion
Integration with external APIs for enrichment
📱 Status
✅ Android: Active (Google Play testing)
🚧 iOS: In progress
🚀 Continuous feature development (AI, social, gamification)
🗺 Vision

BuffaGo is building the most fun way to explore food.

Not just reviews.
Not just maps.
A game layered on top of the real world.

⚠️ Notes
This is an active project and evolving quickly
API keys and sensitive config are managed via environment variables
Contributions and feedback are welcome
👋 Contact

Built by Branden Lemire
Feel free to reach out or connect on LinkedIn
