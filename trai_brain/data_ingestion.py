#!/usr/bin/env python3
"""
TRAI Data Ingestion System - Process and categorize development conversations
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Any
import hashlib
from datetime import datetime

class TRAIDataIngestion:
    def __init__(self):
        self.categories = {
            'architecture': [],
            'development': [],
            'problem_solving': [],
            'business_strategy': [],
            'technical_decisions': [],
            'code_implementation': [],
            'debugging': [],
            'optimization': [],
            'ai_ml_discussion': [],
            'trading_strategy': [],
            'user_motivation': [],
            'project_vision': [],
            'challenges_overcome': [],
            'lessons_learned': [],
            'future_planning': []
        }

        self.stats = {
            'total_messages': 0,
            'categorized_messages': 0,
            'uncategorized_messages': 0,
            'secrets_filtered': 0,
            'filtered_patterns': []
        }

        # Secret filtering patterns
        self.secret_patterns = [
            # API Keys and Tokens
            r'([A-Za-z0-9_-]{20,})',  # Generic long alphanumeric (20+ chars)
            r'(?i)(api[_-]?key|apikey)\s*[=:]\s*["\']?([A-Za-z0-9_-]{10,})["\']?',
            r'(?i)(secret[_-]?key|secretkey)\s*[=:]\s*["\']?([A-Za-z0-9_-]{10,})["\']?',
            r'(?i)(access[_-]?token|accesstoken)\s*[=:]\s*["\']?([A-Za-z0-9_-]{10,})["\']?',
            r'(?i)(auth[_-]?token|authtoken)\s*[=:]\s*["\']?([A-Za-z0-9_-]{10,})["\']?',
            r'(?i)(bearer[_-]?token|bearertoken)\s*[=:]\s*["\']?([A-Za-z0-9_-]{10,})["\']?',

            # Passwords
            r'(?i)(password|passwd|pwd)\s*[=:]\s*["\']?([^"\']{3,})["\']?',
            r'(?i)(db[_-]?password|dbpassword)\s*[=:]\s*["\']?([^"\']{3,})["\']?',

            # JWT and Encryption Keys
            r'eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.?[A-Za-z0-9_-]*',  # JWT tokens
            r'-----BEGIN\s+(?:RSA|EC|DSA|PRIVATE|PUBLIC)\s+KEY-----.*?-----END\s+(?:RSA|EC|DSA|PRIVATE|PUBLIC)\s+KEY-----',  # PEM keys
            r'(?i)(private[_-]?key|privatekey)\s*[=:]\s*["\']?([^"\']{10,})["\']?',

            # Database URLs and Connection Strings
            r'(?i)(mongodb|postgres|mysql|redis)://[^\s\'"]+',
            r'(?i)(database[_-]?url|databaseurl)\s*[=:]\s*["\']?([^"\']+)["\']?',

            # Email addresses (might contain sensitive info)
            r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',

            # IP addresses with potential sensitive context
            r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b',

            # Wallet addresses and crypto keys
            r'\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,}\b',  # Bitcoin addresses
            r'\b0x[a-fA-F0-9]{40}\b',  # Ethereum addresses
            r'(?i)(wallet[_-]?address|walletaddress)\s*[=:]\s*["\']?([^"\']{10,})["\']?',

            # Generic long hex strings (potential keys)
            r'\b[a-fA-F0-9]{32,}\b',  # 32+ hex chars

            # URLs with potential tokens
            r'https?://[^\s\'"]+\?[^\s\'"]*(?:key|token|secret|password|auth)[^\s\'"]*',
        ]

    def process_json_file(self, file_path: str) -> Dict[str, Any]:
        """Process a JSON file containing conversation data"""
        print(f"Processing JSON file: {file_path}")

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)

            # Handle different JSON structures
            messages = []
            if isinstance(json_data, list):
                # Claude format: array of conversations
                if json_data and isinstance(json_data[0], dict) and 'mapping' in json_data[0]:
                    # This is Claude's format - extract messages from mapping
                    messages = self._extract_claude_messages(json_data)
                else:
                    messages = json_data
            elif isinstance(json_data, dict) and 'messages' in json_data:
                messages = json_data['messages']
            elif isinstance(json_data, dict) and 'conversations' in json_data:
                messages = json_data['conversations']
            else:
                # Assume the JSON is a single conversation object
                messages = [json_data]

            processed_messages = []

            for i, message_data in enumerate(messages):
                # Extract message content from various possible formats
                if isinstance(message_data, str):
                    content = message_data
                elif isinstance(message_data, dict):
                    # Try common message field names
                    content = (message_data.get('content') or
                              message_data.get('message') or
                              message_data.get('text') or
                              message_data.get('body') or
                              str(message_data))
                else:
                    content = str(message_data)

                if len(content.strip()) < 50:
                    continue

                self.stats['total_messages'] += 1

                # Get context from previous messages
                context_before = ""
                if i > 0 and processed_messages:
                    prev_messages = processed_messages[-min(3, len(processed_messages)):]
                    context_parts = [msg['content'][-300:] for msg in prev_messages]
                    context_before = " ... ".join(context_parts)

                categories = self.categorize_message(content, context_before)

                if categories != ['uncategorized']:
                    self.stats['categorized_messages'] += 1
                else:
                    self.stats['uncategorized_messages'] += 1

                categorized_message = {
                    'id': hashlib.md5(content.encode()).hexdigest()[:8],
                    'content': content.strip(),
                    'categories': categories,
                    'source_file': Path(file_path).name,
                    'message_index': i,
                    'context_before': context_before,
                    'timestamp': datetime.now().isoformat(),
                    'length': len(content),
                    'conversation_flow': self._analyze_conversation_flow(content, i, messages),
                    'json_metadata': {k: v for k, v in message_data.items() if k not in ['content', 'message', 'text', 'body'] and isinstance(v, (str, int, float, bool))}
                }

                # Add to categories
                for category in categories:
                    if category in self.categories:
                        self.categories[category].append(categorized_message)

                processed_messages.append(categorized_message)

            return {
                'file': Path(file_path).name,
                'messages_processed': len(processed_messages),
                'format': 'json',
                'stats': self.stats.copy()
            }

        except json.JSONDecodeError as e:
            print(f"Error parsing JSON file {file_path}: {e}")
            return {'error': f'JSON parsing failed: {e}'}

    def _extract_claude_messages(self, conversations: list) -> list:
        """Extract messages from Claude's conversation format"""
        all_messages = []

        for conv in conversations:
            if not isinstance(conv, dict) or 'mapping' not in conv:
                continue

            # Extract conversation title for context
            conv_title = conv.get('title', 'Untitled Conversation')

            # Extract messages from mapping
            mapping = conv.get('mapping', {})

            # Sort messages by their relationships (using children pointers)
            processed_ids = set()
            message_list = []

            # Find root message (parent is null)
            for msg_id, msg_data in mapping.items():
                if msg_data.get('parent') is None:
                    message_list.append((msg_id, msg_data))
                    processed_ids.add(msg_id)
                    break

            # Follow the conversation thread
            while message_list:
                current_id, current_data = message_list[-1]

                # Add the message content if it exists
                if current_data.get('message'):
                    msg_obj = current_data['message']
                    if msg_obj.get('content') and msg_obj['content'].get('parts'):
                        content_parts = msg_obj['content']['parts']
                        if content_parts:
                            content = str(content_parts[0]) if isinstance(content_parts[0], str) else str(content_parts)

                            message_dict = {
                                'content': content,
                                'author': msg_obj.get('author', {}).get('role', 'unknown'),
                                'conversation_title': conv_title,
                                'timestamp': conv.get('create_time'),
                                'message_id': msg_obj.get('id')
                            }
                            all_messages.append(message_dict)

                # Find next message in thread
                children = current_data.get('children', [])
                next_child = None
                for child_id in children:
                    if child_id not in processed_ids:
                        next_child = child_id
                        break

                if next_child and next_child in mapping:
                    message_list.append((next_child, mapping[next_child]))
                    processed_ids.add(next_child)
                else:
                    break

        return all_messages

    def filter_secrets(self, content: str) -> tuple[str, list]:
        """Filter out secrets and sensitive information from content

        Returns:
            tuple: (filtered_content, list_of_filtered_secrets)
        """
        filtered_content = content
        filtered_secrets = []

        for pattern in self.secret_patterns:
            try:
                matches = re.findall(pattern, content, re.IGNORECASE | re.DOTALL)
                if matches:
                    for match in matches:
                        # Convert match to string if it's a tuple (from capturing groups)
                        if isinstance(match, tuple):
                            secret_value = ''.join(str(m) for m in match if m)
                        else:
                            secret_value = str(match)

                        # Skip if it's too short (likely false positive)
                        if len(secret_value.strip()) < 8:
                            continue

                        # Replace the secret with a placeholder
                        filtered_content = filtered_content.replace(secret_value, "[REDACTED_SECRET]")

                        # Track what was filtered
                        filtered_secrets.append({
                            'pattern': pattern,
                            'value': secret_value[:20] + "..." if len(secret_value) > 20 else secret_value,
                            'length': len(secret_value)
                        })

                        self.stats['secrets_filtered'] += 1

            except re.error as e:
                print(f"Warning: Invalid regex pattern {pattern}: {e}")
                continue

        return filtered_content, filtered_secrets

    def categorize_message(self, message: str, context: str = "") -> List[str]:
        """Categorize a message into one or more categories"""
        categories = []
        msg_lower = message.lower()
        
        # Architecture discussions
        if any(word in msg_lower for word in ['architecture', 'modular', 'design', 'structure', 'layer', 'component']):
            categories.append('architecture')
        
        # Development process
        if any(word in msg_lower for word in ['implement', 'build', 'create', 'develop', 'coding', 'programming']):
            categories.append('development')
        
        # Problem solving
        if any(word in msg_lower for word in ['fix', 'bug', 'error', 'issue', 'problem', 'debug', 'troubleshoot']):
            categories.append('problem_solving')
        
        # Business strategy
        if any(word in msg_lower for word in ['business', 'revenue', 'monetization', 'market', 'customer', 'sales']):
            categories.append('business_strategy')
        
        # Technical decisions
        if any(word in msg_lower for word in ['decision', 'choose', 'option', 'alternative', 'trade-off']):
            categories.append('technical_decisions')
        
        # Code implementation
        if any(word in msg_lower for word in ['function', 'class', 'method', 'algorithm', 'code']):
            categories.append('code_implementation')
        
        # Debugging
        if any(word in msg_lower for word in ['debug', 'log', 'trace', 'error', 'exception']):
            categories.append('debugging')
        
        # Optimization
        if any(word in msg_lower for word in ['optimize', 'performance', 'speed', 'efficiency', 'improve']):
            categories.append('optimization')
        
        # AI/ML discussion
        if any(word in msg_lower for word in ['ai', 'ml', 'model', 'training', 'neural', 'gpt', 'claude']):
            categories.append('ai_ml_discussion')
        
        # Trading strategy
        if any(word in msg_lower for word in ['trade', 'trading', 'strategy', 'pattern', 'indicator']):
            categories.append('trading_strategy')
        
        # User motivation/personal
        if any(word in msg_lower for word in ['family', 'daughter', 'dad', 'motivation', 'dream', 'future']):
            categories.append('user_motivation')
        
        # Project vision
        if any(word in msg_lower for word in ['vision', 'goal', 'mission', 'dream', 'future']):
            categories.append('project_vision')
        
        # Challenges overcome
        if any(word in msg_lower for word in ['challenge', 'overcome', 'difficult', 'hard', 'struggle']):
            categories.append('challenges_overcome')
        
        # Lessons learned
        if any(word in msg_lower for word in ['lesson', 'learned', 'mistake', 'improvement', 'better']):
            categories.append('lessons_learned')
        
        # Future planning
        if any(word in msg_lower for word in ['future', 'plan', 'roadmap', 'next', 'upcoming']):
            categories.append('future_planning')
        
        return categories if categories else ['uncategorized']
    
    def _analyze_conversation_flow(self, content: str, index: int, all_messages: list) -> str:
        """Analyze how this message fits into the conversation flow"""
        flow_type = "standalone"

        # Look for iterative development patterns
        if any(word in content.lower() for word in ['instead', 'changed', 'modified', 'updated', 'fixed']):
            flow_type = "iteration"
        elif any(word in content.lower() for word in ['problem', 'issue', 'error', 'bug']):
            flow_type = "problem_solving"
        elif any(word in content.lower() for word in ['plan', 'next', 'future', 'roadmap']):
            flow_type = "planning"
        elif index > 0 and len(all_messages) > index - 1:
            # Handle both string messages (MD processing) and dict messages (JSON processing)
            if isinstance(all_messages[index - 1], dict):
                prev_content = all_messages[index - 1].get('content', '').lower()
            else:
                prev_content = str(all_messages[index - 1]).lower()

            if any(word in prev_content for word in ['how', 'what', 'why', 'can you']):
                flow_type = "response"

        return flow_type

    def _process_extremely_large_file(self, file_path: str) -> Dict[str, Any]:
        """Process extremely large files (>100MB) using streaming approach"""
        print(f"Processing extremely large file {file_path} using streaming...")

        # Process file in small chunks without loading entire file into memory
        chunk_size = 65536  # 64KB chunks
        buffer = ""
        processed_count = 0
        context_buffer = []  # Keep recent context messages

        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break

                buffer += chunk

                # Process complete messages in buffer
                messages = self._extract_messages_from_buffer(buffer)

                for message in messages:
                    if len(message.strip()) < 50:
                        continue

                    # 🔐 SECURITY: Filter secrets before processing
                    filtered_message, secrets_found = self.filter_secrets(message)
                    if secrets_found:
                        print(f"🔒 Filtered {len(secrets_found)} secrets from message {processed_count}")
                        # Log filtered secrets for audit trail
                        for secret in secrets_found:
                            self.stats['filtered_patterns'].append({
                                'message_index': processed_count,
                                'pattern': secret['pattern'],
                                'preview': secret['value']
                            })

                    processed_count += 1
                    self.stats['total_messages'] += 1

                    # Build context from recent messages
                    context_before = " ... ".join([msg['content'][-200:] for msg in context_buffer[-3:]])

                    categories = self.categorize_message(filtered_message, context_before)

                    if categories != ['uncategorized']:
                        self.stats['categorized_messages'] += 1
                    else:
                        self.stats['uncategorized_messages'] += 1

                    categorized_message = {
                        'id': hashlib.md5(filtered_message.encode()).hexdigest()[:8],
                        'content': filtered_message.strip(),  # Use filtered content
                        'original_length': len(message),
                        'filtered_secrets': len(secrets_found),
                        'categories': categories,
                        'source_file': Path(file_path).name,
                        'message_index': processed_count,
                        'context_before': context_before,
                        'timestamp': datetime.now().isoformat(),
                        'length': len(filtered_message),
                        'conversation_flow': 'streaming_processed',
                        'file_position': f.tell() - len(buffer)
                    }

                    # Add to categories
                    for category in categories:
                        if category in self.categories:
                            self.categories[category].append(categorized_message)

                    # Keep recent messages for context (limit to last 5)
                    context_buffer.append(categorized_message)
                    if len(context_buffer) > 5:
                        context_buffer.pop(0)

                # Keep some buffer for next iteration's context
                buffer = buffer[-10000:]  # Keep last 10KB for context

                if processed_count % 1000 == 0 and processed_count > 0:
                    print(f"Processed {processed_count} messages from large file...")

        return {
            'file': Path(file_path).name,
            'messages_processed': processed_count,
            'processing_method': 'streaming_extremely_large',
            'stats': self.stats.copy()
        }

    def _process_large_file_streaming(self, file_path: str) -> Dict[str, Any]:
        """Process large files (10-100MB) using memory-efficient streaming"""
        print(f"Processing large file {file_path} using memory-efficient streaming...")

        # Read entire file but process in smaller logical chunks
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Split into smaller chunks for processing
        chunk_size = 50000  # 50KB logical chunks
        chunks = [content[i:i+chunk_size] for i in range(0, len(content), chunk_size)]
        overlap = 5000  # 5KB overlap

        processed_messages = []

        for i, chunk in enumerate(chunks):
            # Add overlap from previous chunk
            if i > 0:
                overlap_start = max(0, (i * chunk_size) - overlap)
                overlap_content = content[overlap_start:i * chunk_size]
                chunk = overlap_content + chunk

            # Process this chunk
            chunk_messages = re.split(r'(?=## |### |^\d+\. |^- |\n\n(?=[A-Z]))', chunk, flags=re.MULTILINE)

            for j, message in enumerate(chunk_messages):
                if len(message.strip()) < 50:
                    continue

                # 🔐 SECURITY: Filter secrets before processing
                filtered_message, secrets_found = self.filter_secrets(message)
                if secrets_found:
                    print(f"🔒 Filtered {len(secrets_found)} secrets from chunk message {len(processed_messages)}")
                    # Log filtered secrets for audit trail
                    for secret in secrets_found:
                        self.stats['filtered_patterns'].append({
                            'message_index': len(processed_messages),
                            'pattern': secret['pattern'],
                            'preview': secret['value']
                        })

                self.stats['total_messages'] += 1

                # Build context from recent messages
                context_before = ""
                if processed_messages:
                    recent_contexts = [msg['content'][-300:] for msg in processed_messages[-3:]]
                    context_before = " ... ".join(recent_contexts)

                categories = self.categorize_message(filtered_message, context_before)

                if categories != ['uncategorized']:
                    self.stats['categorized_messages'] += 1
                else:
                    self.stats['uncategorized_messages'] += 1

                categorized_message = {
                    'id': hashlib.md5(message.encode()).hexdigest()[:8],
                    'content': message.strip(),
                    'categories': categories,
                    'source_file': Path(file_path).name,
                    'chunk_number': i,
                    'message_index': len(processed_messages),
                    'context_before': context_before,
                    'timestamp': datetime.now().isoformat(),
                    'length': len(message),
                    'conversation_flow': self._analyze_conversation_flow(message, j, chunk_messages),
                    'file_position': i * chunk_size
                }

                # Add to categories
                for category in categories:
                    if category in self.categories:
                        self.categories[category].append(categorized_message)

                processed_messages.append(categorized_message)

        return {
            'file': Path(file_path).name,
            'messages_processed': len(processed_messages),
            'chunks_processed': len(chunks),
            'processing_method': 'streaming_large',
            'stats': self.stats.copy()
        }

    def _extract_messages_from_buffer(self, buffer: str) -> List[str]:
        """Extract complete messages from a buffer during streaming"""
        # Split on conversation markers
        messages = re.split(r'(?=## |### |^\d+\. |^- |\n\n(?=[A-Z]))', buffer, flags=re.MULTILINE)

        # Filter out incomplete messages (those that might be cut off)
        complete_messages = []
        for msg in messages:
            # Consider a message complete if it ends with sentence endings or is substantial
            if len(msg.strip()) > 100 and (msg.strip().endswith(('.', '!', '?', '\n\n')) or len(msg.strip()) > 500):
                complete_messages.append(msg)

        return complete_messages

    def _process_large_file(self, file_path: str, content: str) -> Dict[str, Any]:
        """Process very large files in chunks while preserving conversation context"""
        file_size = len(content)
        chunk_size = 100000  # 100KB chunks
        overlap_size = 5000  # 5KB overlap between chunks for context

        print(f"Processing large file in {file_size // chunk_size + 1} chunks")

        all_processed_messages = []

        for chunk_start in range(0, file_size, chunk_size - overlap_size):
            chunk_end = min(chunk_start + chunk_size, file_size)
            chunk_content = content[chunk_start:chunk_end]

            # Add overlap from previous chunk if not first chunk
            if chunk_start > 0:
                overlap_start = max(0, chunk_start - overlap_size)
                overlap_content = content[overlap_start:chunk_start]
                chunk_content = overlap_content + chunk_content

            # Process this chunk
            chunk_messages = re.split(r'(?=## |### |^\d+\. |^- |\n\n(?=[A-Z]))', chunk_content, flags=re.MULTILINE)

            chunk_processed = []
            for i, message in enumerate(chunk_messages):
                if len(message.strip()) < 50:
                    continue

                # Enhanced context for large files - look further back
                context_before = ""
                if chunk_processed:
                    # Get context from recent messages in this chunk
                    recent_contexts = []
                    for prev_msg in chunk_processed[-min(3, len(chunk_processed)):]:
                        recent_contexts.append(prev_msg['content'][-300:])  # Shorter context per message
                    context_before = " ... ".join(recent_contexts)

                categories = self.categorize_message(message, context_before)

                if categories != ['uncategorized']:
                    self.stats['categorized_messages'] += 1
                else:
                    self.stats['uncategorized_messages'] += 1

                self.stats['total_messages'] += 1

                categorized_message = {
                    'id': hashlib.md5(message.encode()).hexdigest()[:8],
                    'content': message.strip(),
                    'categories': categories,
                    'source_file': Path(file_path).name,
                    'chunk_number': chunk_start // (chunk_size - overlap_size),
                    'message_index': len(all_processed_messages) + len(chunk_processed),
                    'context_before': context_before,
                    'timestamp': datetime.now().isoformat(),
                    'length': len(message),
                    'conversation_flow': self._analyze_conversation_flow(message, i, chunk_messages),
                    'file_position': chunk_start + chunk_content.find(message) if message in chunk_content else chunk_start
                }

                # Add to categories
                for category in categories:
                    if category in self.categories:
                        self.categories[category].append(categorized_message)

                chunk_processed.append(categorized_message)

            all_processed_messages.extend(chunk_processed)
            print(f"Processed chunk {chunk_start // (chunk_size - overlap_size) + 1}: {len(chunk_processed)} messages")

        return {
            'file': Path(file_path).name,
            'messages_processed': len(all_processed_messages),
            'chunks_processed': file_size // (chunk_size - overlap_size) + 1,
            'stats': self.stats.copy()
        }

    def process_md_file(self, file_path: str) -> Dict[str, Any]:
        """Process a markdown file and categorize its content while preserving context"""
        print(f"Processing {file_path}...")

        # Check file size first without loading into memory
        file_size = Path(file_path).stat().st_size
        print(f"File size: {file_size:,} bytes ({file_size/1024/1024:.1f} MB)")

        # Handle extremely large files (over 100MB)
        if file_size > 100000000:  # 100MB threshold
            print("Extremely large file detected - using streaming processing")
            return self._process_extremely_large_file(file_path)

        # Handle large files (10-100MB)
        if file_size > 10000000:  # 10MB threshold
            print("Large file detected - processing in memory-efficient chunks")
            return self._process_large_file_streaming(file_path)

        # Normal file processing
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Enhanced message splitting that preserves conversation flow
        # Split on common conversation markers while maintaining context
        messages = re.split(r'(?=## |### |^\d+\. |^- |\n\n(?=[A-Z]))', content, flags=re.MULTILINE)

        processed_messages = []

        for i, message in enumerate(messages):
            if len(message.strip()) < 50:  # Skip very short messages
                continue

            # 🔐 SECURITY: Filter secrets before processing
            filtered_message, secrets_found = self.filter_secrets(message)
            if secrets_found:
                print(f"🔒 Filtered {len(secrets_found)} secrets from message {i}")
                # Log filtered secrets for audit trail
                for secret in secrets_found:
                    self.stats['filtered_patterns'].append({
                        'message_index': i,
                        'pattern': secret['pattern'],
                        'preview': secret['value']
                    })

            self.stats['total_messages'] += 1

            # Get enhanced context from previous messages (up to 2000 chars for large conversations)
            context_before = ""
            if i > 0 and processed_messages:
                # Get context from multiple previous messages if available
                context_parts = []
                context_chars = 0
                max_context_chars = 2000  # Increased for larger conversations

                # Go backwards through previous messages to build context
                for j in range(min(3, i)):  # Look at up to 3 previous messages
                    prev_idx = i - 1 - j
                    if prev_idx >= 0 and prev_idx < len(processed_messages):
                        prev_content = processed_messages[prev_idx]['content']
                        if context_chars + len(prev_content) <= max_context_chars:
                            context_parts.insert(0, prev_content[-500:])  # Last 500 chars of each prev message
                            context_chars += len(prev_content)

                context_before = " ... ".join(context_parts)

            # Enhanced categorization with context awareness (use filtered message)
            categories = self.categorize_message(filtered_message, context_before)

            if categories != ['uncategorized']:
                self.stats['categorized_messages'] += 1
            else:
                self.stats['uncategorized_messages'] += 1

            # Add temporal and contextual metadata
            categorized_message = {
                'id': hashlib.md5(filtered_message.encode()).hexdigest()[:8],
                'content': filtered_message.strip(),  # Use filtered content
                'original_length': len(message),
                'filtered_secrets': len(secrets_found),
                'categories': categories,
                'source_file': Path(file_path).name,
                'message_index': i,
                'context_before': context_before,
                'timestamp': datetime.now().isoformat(),
                'length': len(filtered_message),
                'conversation_flow': self._analyze_conversation_flow(filtered_message, i, messages),
                'file_position': content.find(message) if message in content else 0
            }

            # Add to appropriate categories with context preservation
            for category in categories:
                if category in self.categories:
                    self.categories[category].append(categorized_message)

            processed_messages.append(categorized_message)
        
        return {
            'file': Path(file_path).name,
            'messages_processed': len(processed_messages),
            'stats': self.stats.copy()
        }
    
    def generate_static_brain(self, output_dir: str = "trai_brain"):
        """Generate TRAI's static brain files from categorized data"""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        # Create category files
        for category, messages in self.categories.items():
            if not messages:
                continue
                
            category_file = output_path / f"{category}.json"
            
            category_data = {
                'category': category,
                'description': self.get_category_description(category),
                'total_messages': len(messages),
                'messages': messages,
                'generated_at': datetime.now().isoformat(),
                'stats': self.stats
            }
            
            with open(category_file, 'w', encoding='utf-8') as f:
                json.dump(category_data, f, indent=2, ensure_ascii=False)
            
            print(f"Created {category_file} with {len(messages)} messages")
        
        # Create master index
        master_index = {
            'trai_static_brain': {
                'version': '1.0.0',
                'generated_at': datetime.now().isoformat(),
                'total_messages': self.stats['total_messages'],
                'categorized_messages': self.stats['categorized_messages'],
                'categories': {cat: len(msgs) for cat, msgs in self.categories.items() if msgs},
                'source_files': [],  # Will be populated when processing files
                'personality_traits': {
                    'motivation': 'family_first_financial_freedom',
                    'communication_style': 'direct_professional_encouraging',
                    'expertise_areas': ['trading_systems', 'ai_development', 'business_automation'],
                    'core_values': ['family', 'innovation', 'reliability', 'growth']
                }
            }
        }
        
        with open(output_path / "master_index.json", 'w', encoding='utf-8') as f:
            json.dump(master_index, f, indent=2, ensure_ascii=False)
    
    def get_category_description(self, category: str) -> str:
        """Get description for each category"""
        descriptions = {
            'architecture': 'System design, modular architecture, and technical structure decisions',
            'development': 'Code implementation, feature development, and programming discussions',
            'problem_solving': 'Bug fixes, error resolution, and troubleshooting processes',
            'business_strategy': 'Revenue models, market positioning, and business growth strategies',
            'technical_decisions': 'Architecture choices, technology selections, and trade-off analysis',
            'code_implementation': 'Specific code writing, algorithm development, and implementation details',
            'debugging': 'Error investigation, logging strategies, and diagnostic procedures',
            'optimization': 'Performance improvements, efficiency enhancements, and optimization techniques',
            'ai_ml_discussion': 'AI/ML model discussions, training strategies, and machine learning topics',
            'trading_strategy': 'Trading algorithms, market analysis, and trading system design',
            'user_motivation': 'Personal motivation, family goals, and driving factors behind the project',
            'project_vision': 'Long-term goals, mission statements, and project aspirations',
            'challenges_overcome': 'Difficulties faced and solutions implemented',
            'lessons_learned': 'Key insights, mistakes made, and improvements identified',
            'future_planning': 'Roadmap planning, upcoming features, and long-term strategy'
        }
        return descriptions.get(category, f"Content related to {category}")

def main():
    ingestion = TRAIDataIngestion()

    # Auto-discover all conversation files in /opt/ogzprime/
    conversation_dir = Path("/opt/ogzprime/")
    md_files = list(conversation_dir.glob("*.md"))
    json_files = list(conversation_dir.glob("*.json"))

    all_files = md_files + json_files

    if not all_files:
        print("❌ No conversation files found in /opt/ogzprime/")
        print("Expected files: *.md and *.json files containing chat history")
        return []

    print(f"🔍 Found {len(all_files)} conversation files:")
    for file_path in all_files:
        size_mb = file_path.stat().st_size / 1024 / 1024
        print(f"  📄 {file_path.name} ({size_mb:.1f} MB)")

    results = []
    for file_path in all_files:
        file_ext = file_path.suffix.lower()
        try:
            if file_ext == '.json':
                print(f"\n🔄 Processing JSON file: {file_path.name}")
                result = ingestion.process_json_file(str(file_path))
            else:  # .md or other text files
                print(f"\n🔄 Processing text file: {file_path.name}")
                result = ingestion.process_md_file(str(file_path))

            if 'error' not in result:
                results.append(result)
                print(f"✅ Processed {result.get('messages_processed', 0)} messages from {result['file']}")
            else:
                print(f"❌ Error processing {file_path.name}: {result['error']}")

        except Exception as e:
            print(f"❌ Failed to process {file_path.name}: {e}")

    # Generate TRAI's static brain
    print("\n🧠 Generating TRAI's static brain...")
    ingestion.generate_static_brain()

    print(f"\n🎉 TRAI Data Ingestion Complete!")
    print(f"📊 Total messages: {ingestion.stats['total_messages']:,}")
    print(f"✅ Categorized: {ingestion.stats['categorized_messages']:,}")
    print(f"❓ Uncategorized: {ingestion.stats['uncategorized_messages']:,}")
    print(f"🔒 Secrets filtered: {ingestion.stats['secrets_filtered']:,}")
    print(f"📁 Files processed: {len(results)}")

    # Show category breakdown
    print("\n📈 Category Breakdown:")
    for category, messages in sorted(ingestion.categories.items()):
        if messages:
            print(f"  {category}: {len(messages)} messages")

    # Show security summary
    if ingestion.stats['filtered_patterns']:
        print(f"\n🔐 Security Summary:")
        print(f"  Secrets filtered: {ingestion.stats['secrets_filtered']}")
        print(f"  Unique patterns found: {len(set(p['pattern'] for p in ingestion.stats['filtered_patterns']))}")

    return results

if __name__ == "__main__":
    main()
