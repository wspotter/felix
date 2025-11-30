/**
 * Social Media Management Module
 * Handles Facebook and Instagram API integration for the art supply store
 */

import 'dotenv/config';
import fetch from 'node-fetch';

interface SocialPost {
  platform: 'facebook' | 'instagram';
  message: string;
  imageUrl?: string;
  link?: string;
  scheduledTime?: string;
  hashtags?: string[];
}

interface PostResult {
  success: boolean;
  postId?: string;
  platform: string;
  scheduledTime?: string;
  error?: string;
}

interface Comment {
  id: string;
  text: string;
  from: string;
  timestamp: string;
  platform: string;
}

interface Analytics {
  platform: string;
  period: string;
  metrics: {
    reach: number;
    impressions: number;
    engagement: number;
    followers: number;
    followerGrowth: number;
  };
  topPosts: Array<{
    id: string;
    content: string;
    likes: number;
    comments: number;
    shares: number;
  }>;
}

export class SocialMediaManager {
  private fbPageToken: string;
  private fbPageId: string;
  private igAccountId: string;
  private apiVersion: string = 'v18.0';

  constructor() {
    // Load credentials from environment variables
    this.fbPageToken = process.env.FB_PAGE_TOKEN || '';
    this.fbPageId = process.env.FB_PAGE_ID || '';
    this.igAccountId = process.env.IG_ACCOUNT_ID || '';
  }

  /**
   * Check if credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.fbPageToken && this.fbPageId);
  }

  /**
   * Post to Facebook page
   */
  async postToFacebook(post: SocialPost): Promise<PostResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        platform: 'facebook',
        error: 'Facebook API not configured. Please set FB_PAGE_TOKEN and FB_PAGE_ID environment variables.'
      };
    }

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.fbPageId}/feed`;
      
      const body: any = {
        message: post.message,
        access_token: this.fbPageToken,
      };

      if (post.link) {
        body.link = post.link;
      }

      if (post.scheduledTime) {
        body.published = false;
        body.scheduled_publish_time = Math.floor(new Date(post.scheduledTime).getTime() / 1000);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json() as any;

      if (result.error) {
        return {
          success: false,
          platform: 'facebook',
          error: result.error.message
        };
      }

      return {
        success: true,
        postId: result.id,
        platform: 'facebook',
        scheduledTime: post.scheduledTime
      };
    } catch (error: any) {
      return {
        success: false,
        platform: 'facebook',
        error: error.message
      };
    }
  }

  /**
   * Post to Instagram
   */
  async postToInstagram(post: SocialPost): Promise<PostResult> {
    if (!this.isConfigured() || !this.igAccountId) {
      return {
        success: false,
        platform: 'instagram',
        error: 'Instagram API not configured. Please set IG_ACCOUNT_ID environment variable.'
      };
    }

    if (!post.imageUrl) {
      return {
        success: false,
        platform: 'instagram',
        error: 'Instagram posts require an image. Please provide imageUrl.'
      };
    }

    try {
      // Step 1: Create media container
      const containerUrl = `https://graph.facebook.com/${this.apiVersion}/${this.igAccountId}/media`;
      
      let caption = post.message;
      if (post.hashtags && post.hashtags.length > 0) {
        caption += '\n\n' + post.hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
      }

      const containerBody: any = {
        image_url: post.imageUrl,
        caption: caption,
        access_token: this.fbPageToken
      };

      const containerResponse = await fetch(containerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerBody)
      });

      const containerResult = await containerResponse.json() as any;

      if (containerResult.error) {
        return {
          success: false,
          platform: 'instagram',
          error: containerResult.error.message
        };
      }

      const containerId = containerResult.id;

      // Step 2: Publish container
      const publishUrl = `https://graph.facebook.com/${this.apiVersion}/${this.igAccountId}/media_publish`;
      
      const publishBody = {
        creation_id: containerId,
        access_token: this.fbPageToken
      };

      const publishResponse = await fetch(publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishBody)
      });

      const publishResult = await publishResponse.json() as any;

      if (publishResult.error) {
        return {
          success: false,
          platform: 'instagram',
          error: publishResult.error.message
        };
      }

      return {
        success: true,
        postId: publishResult.id,
        platform: 'instagram'
      };
    } catch (error: any) {
      return {
        success: false,
        platform: 'instagram',
        error: error.message
      };
    }
  }

  /**
   * Get recent comments from Facebook
   */
  async getFacebookComments(sinceHours: number = 24): Promise<Comment[]> {
    if (!this.isConfigured()) {
      throw new Error('Facebook API not configured');
    }

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.fbPageId}/feed`;
      const params = new URLSearchParams({
        fields: 'id,message,comments{message,from,created_time}',
        access_token: this.fbPageToken,
        limit: '25'
      });

      const response = await fetch(`${url}?${params}`);
      const result = await response.json() as any;

      const comments: Comment[] = [];
      
      if (result.data) {
        const cutoffTime = Date.now() - (sinceHours * 60 * 60 * 1000);
        
        for (const post of result.data) {
          if (post.comments && post.comments.data) {
            for (const comment of post.comments.data) {
              const commentTime = new Date(comment.created_time).getTime();
              if (commentTime > cutoffTime) {
                comments.push({
                  id: comment.id,
                  text: comment.message,
                  from: comment.from.name,
                  timestamp: comment.created_time,
                  platform: 'facebook'
                });
              }
            }
          }
        }
      }

      return comments;
    } catch (error: any) {
      throw new Error(`Failed to fetch comments: ${error.message}`);
    }
  }

  /**
   * Get analytics for Facebook page
   */
  async getFacebookAnalytics(days: number = 7): Promise<Analytics> {
    if (!this.isConfigured()) {
      throw new Error('Facebook API not configured');
    }

    try {
      // Get page insights
      const insightsUrl = `https://graph.facebook.com/${this.apiVersion}/${this.fbPageId}/insights`;
      const params = new URLSearchParams({
        metric: 'page_impressions,page_engaged_users,page_fans',
        period: 'day',
        since: Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000).toString(),
        access_token: this.fbPageToken
      });

      const response = await fetch(`${insightsUrl}?${params}`);
      const result = await response.json() as any;

      // Get recent posts for top posts
      const postsUrl = `https://graph.facebook.com/${this.apiVersion}/${this.fbPageId}/posts`;
      const postsParams = new URLSearchParams({
        fields: 'message,likes.summary(true),comments.summary(true),shares',
        limit: '10',
        access_token: this.fbPageToken
      });

      const postsResponse = await fetch(`${postsUrl}?${postsParams}`);
      const postsResult = await postsResponse.json() as any;

      // Parse metrics
      let reach = 0;
      let engagement = 0;
      let followers = 0;

      if (result.data) {
        for (const metric of result.data) {
          if (metric.name === 'page_impressions' && metric.values.length > 0) {
            reach = metric.values.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
          }
          if (metric.name === 'page_engaged_users' && metric.values.length > 0) {
            engagement = metric.values.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
          }
          if (metric.name === 'page_fans' && metric.values.length > 0) {
            followers = metric.values[metric.values.length - 1].value || 0;
          }
        }
      }

      // Parse top posts
      const topPosts = [];
      if (postsResult.data) {
        for (const post of postsResult.data.slice(0, 5)) {
          topPosts.push({
            id: post.id,
            content: (post.message || '').substring(0, 100) + '...',
            likes: post.likes?.summary?.total_count || 0,
            comments: post.comments?.summary?.total_count || 0,
            shares: post.shares?.count || 0
          });
        }
      }

      return {
        platform: 'facebook',
        period: `last ${days} days`,
        metrics: {
          reach: reach,
          impressions: reach, // Simplified
          engagement: engagement,
          followers: followers,
          followerGrowth: 0 // Would need historical comparison
        },
        topPosts: topPosts
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch analytics: ${error.message}`);
    }
  }

  /**
   * Generate post ideas based on products and themes
   */
  generatePostIdeas(theme: string, products: string[]): string[] {
    const ideas: string[] = [];

    // Seasonal/theme-based ideas
    const seasonalTemplates = {
      'fall': [
        `🍂 Fall into creativity! Our ${products[0]} are perfect for capturing autumn's warm colors. What's your favorite season to paint?`,
        `Cozy up with some art this fall! ✨ Check out our ${products[0]} - perfect for your next masterpiece.`,
        `Fall art vibes 🎨 Featuring: ${products.join(', ')}. Come visit us and get inspired!`
      ],
      'winter': [
        `❄️ Winter creativity is in the air! Stay warm and paint with our ${products[0]}.`,
        `Snowy days call for indoor art projects! ☃️ We've got everything you need including ${products.join(' and ')}.`
      ],
      'spring': [
        `🌸 Spring into art! Fresh new ${products[0]} just arrived. Perfect for capturing the season's vibrant colors!`,
        `Bloom where you're planted 🌷 Create something beautiful with our ${products.join(', ')}.`
      ],
      'summer': [
        `☀️ Summer art fun! Beat the heat with a creative project using our ${products[0]}.`,
        `Sunshine and art supplies ☀️ The perfect summer combo! Featuring ${products.join(' and ')}.`
      ]
    };

    // Product-focused ideas
    const productTemplates = [
      `✨ New arrival alert! ${products[0]} now in stock. Limited quantities available!`,
      `Artist spotlight: ${products[0]} 🎨 Perfect for ${this.getProductUseCase(products[0])}. In store now!`,
      `Did you know? Our ${products[0]} are customer favorites! ⭐ Stop by and see why everyone loves them.`,
      `Weekend project idea: Try ${products[0]} for your next creation! 🖌️ Tag us in your finished work!`,
      `Behind the counter: We love our ${products[0]}! 💙 What's your go-to art supply?`
    ];

    // Engagement ideas
    const engagementTemplates = [
      `💭 Question for our creative community: What's your favorite medium to work with? (We love ${products[0]}!)`,
      `🎨 Share your progress! Drop a photo of what you're working on in the comments. Need supplies? We've got ${products.join(', ')} and more!`,
      `⭐ Customer appreciation post! Thank you for supporting our small business. Come see what's new - ${products[0]} just restocked!`
    ];

    // Select appropriate ideas based on theme
    const themeKey = theme.toLowerCase();
    if (themeKey in seasonalTemplates) {
      ideas.push(...(seasonalTemplates as any)[themeKey]);
    } else {
      ideas.push(...productTemplates.slice(0, 3));
    }

    ideas.push(...engagementTemplates.slice(0, 2));

    return ideas.slice(0, 5);
  }

  /**
   * Generate optimal hashtags for a post topic
   */
  generateHashtags(topic: string, location: boolean = false): string[] {
    const baseHashtags = [
      'art', 'artist', 'artwork', 'creative', 'handmade',
      'artsupplies', 'painting', 'draw', 'sketch', 'create'
    ];

    const topicHashtags: { [key: string]: string[] } = {
      'paint': ['acrylicpainting', 'oilpainting', 'watercolor', 'paintingoftheday', 'artistsoninstagram'],
      'brush': ['brushes', 'paintbrushes', 'arttool', 'paintingtools', 'artisttools'],
      'canvas': ['canvasart', 'stretchedcanvas', 'canvaspainting', 'artcanvas'],
      'drawing': ['drawing', 'sketch', 'pencilart', 'illustration', 'dailydrawing'],
      'beginner': ['artforbeginners', 'learntopaint', 'beginnersartist', 'artclass', 'arttutorial'],
      'workshop': ['artworkshop', 'artclass', 'learntopaint', 'creativeworkshop', 'artcommunity']
    };

    let hashtags = [...baseHashtags];

    // Add topic-specific hashtags
    const lowerTopic = topic.toLowerCase();
    for (const [key, tags] of Object.entries(topicHashtags)) {
      if (lowerTopic.includes(key)) {
        hashtags.push(...tags);
      }
    }

    // Add location-based hashtags if requested
    if (location) {
      hashtags.push('shoplocal', 'supportlocal', 'localbusiness', 'localartstore');
    }

    // Remove duplicates and return top 15
    return [...new Set(hashtags)].slice(0, 15);
  }

  /**
   * Helper: Get use case for a product
   */
  private getProductUseCase(product: string): string {
    const useCases: { [key: string]: string } = {
      'paint': 'both beginners and professionals',
      'brush': 'detailed work and bold strokes',
      'canvas': 'your next masterpiece',
      'pencil': 'sketching and drawing',
      'watercolor': 'beautiful transparent effects',
      'acrylic': 'vibrant, versatile painting',
      'oil': 'rich, blendable colors',
      'easel': 'studio or plein air painting'
    };

    const lowerProduct = product.toLowerCase();
    for (const [key, useCase] of Object.entries(useCases)) {
      if (lowerProduct.includes(key)) {
        return useCase;
      }
    }

    return 'all your creative projects';
  }

  /**
   * Generate AI-enhanced comment reply suggestions
   */
  generateCommentReplySuggestions(comment: string, context?: any): string[] {
    const suggestions: string[] = [];
    const lowerComment = comment.toLowerCase();

    // Stock/availability questions
    if (lowerComment.includes('stock') || lowerComment.includes('available') || lowerComment.includes('have')) {
      suggestions.push(
        "Thanks for asking! Let me check our current stock for you. We'd be happy to help! 😊",
        "Great question! Yes, we have that in stock right now. Stop by or give us a call! 🎨",
        "We just got a fresh shipment in! Come see us soon - we'd love to help you find what you need! ✨"
      );
    }

    // Hours/location questions
    if (lowerComment.includes('hour') || lowerComment.includes('open') || lowerComment.includes('location')) {
      suggestions.push(
        "We're open Monday-Saturday 9am-6pm, Sunday 11am-5pm. See you soon! 🏪",
        "Come visit us at [Your Address]! We're open [Your Hours]. Can't wait to see you! 📍"
      );
    }

    // Price questions
    if (lowerComment.includes('price') || lowerComment.includes('cost') || lowerComment.includes('$')) {
      suggestions.push(
        "Great question! Prices vary by product. Give us a call or stop by and we'll get you all the details! 📞",
        "We'd be happy to help with pricing! Feel free to DM us or call the store for current prices. 😊"
      );
    }

    // Recommendation requests
    if (lowerComment.includes('recommend') || lowerComment.includes('suggest') || lowerComment.includes('best')) {
      suggestions.push(
        "We'd love to help you find the perfect supplies! What type of art are you working on? 🎨",
        "Great question! Stop by and our staff can give you personalized recommendations based on your project! ✨"
      );
    }

    // Beginner questions
    if (lowerComment.includes('beginner') || lowerComment.includes('start') || lowerComment.includes('learn')) {
      suggestions.push(
        "Welcome to the art community! 🎉 We have starter kits perfect for beginners. Come visit us!",
        "That's so exciting! We love helping beginners get started. Stop by and we'll help you find everything you need! 🌟"
      );
    }

    // Compliments
    if (lowerComment.includes('love') || lowerComment.includes('beautiful') || lowerComment.includes('amazing') || lowerComment.includes('❤️') || lowerComment.includes('😍')) {
      suggestions.push(
        "Thank you so much! Your support means the world to us! 💙",
        "Thank you! We're so glad you love it! Come visit us soon! 🎨✨",
        "Thank you! ❤️ Your kind words make our day! We appreciate you!"
      );
    }

    // Default suggestions if no specific match
    if (suggestions.length === 0) {
      suggestions.push(
        "Thanks for your comment! We'd love to help - feel free to DM us or stop by the store! 😊",
        "Great to hear from you! Let us know if you have any questions - we're here to help! 🎨",
        "Thank you for engaging with us! We appreciate your support! ✨"
      );
    }

    return suggestions.slice(0, 3);
  }
}

// Export singleton instance
export const socialMediaManager = new SocialMediaManager();
